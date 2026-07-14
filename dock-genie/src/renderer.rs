//! wgpu renderer that runs the Genie‑effect fragment shader.
//!
//! Creates a full‑screen quad pipeline, accepts a source RGBA texture,
//! and renders each frame to an off‑screen texture.  The caller reads
//! back the result as raw RGBA bytes.

use std::borrow::Cow;
use bytemuck::Zeroable;
use wgpu::util::DeviceExt;

use crate::animation::GenieUniforms;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Round `bytes` up to the next multiple of `COPY_BYTES_PER_ROW_ALIGNMENT` (256).
const fn aligned_bytes_per_row(bytes: u32) -> u32 {
    (bytes + 255) & !255
}

// ---------------------------------------------------------------------------
// WGSL shader source
// ---------------------------------------------------------------------------

/// The complete vertex + fragment shader implementing the Genie effect.
///
/// ## Effect order (fragment shader, reverse transform from output → source):
/// 1. Convert output pixel → centred UV
/// 2. Inverse translation (move back from dock)
/// 3. Inverse scale (un‑shrink)
/// 4. Inverse genie squeeze (horizontal un‑compress, v‑dependent)
/// 5. Inverse perspective (rotateX reversal)
/// 6. Directional motion blur along the velocity vector
/// 7. Edge feather + opacity apply
const SHADER_SOURCE: &str = include_str!("shader.wgsl");

// ---------------------------------------------------------------------------
// Renderer
// ---------------------------------------------------------------------------

/// Wraps all wgpu resources needed to render Genie‑effect frames.
pub struct GenieRenderer {
    device: wgpu::Device,
    queue: wgpu::Queue,

    /// Render pipeline (vertex = fullscreen tri, fragment = genie).
    pipeline: wgpu::RenderPipeline,

    /// Bind‑group layout shared by all frames.
    bind_group_layout: wgpu::BindGroupLayout,

    /// Nearest‑neighbour sampler (re‑created when source size changes).
    sampler: wgpu::Sampler,

    /// Current source texture (RGBA).
    source_texture: Option<wgpu::Texture>,
    source_texture_view: Option<wgpu::TextureView>,

    /// Off‑screen render target.
    output_texture: Option<wgpu::Texture>,
    output_texture_view: Option<wgpu::TextureView>,

    /// Uniform buffer (updated each frame).
    uniform_buffer: wgpu::Buffer,

    /// Buffer for reading back the rendered frame.
    readback_buffer: Option<wgpu::Buffer>,

    /// Cached dimensions.
    src_width: u32,
    src_height: u32,
    dst_width: u32,
    dst_height: u32,
}

impl GenieRenderer {
    /// Initialise wgpu and create all reusable GPU resources.
    ///
    /// `initial_width` / `initial_height` are used for the output texture;
    /// the source texture is set later via [`set_source_texture`].
    pub async fn new(width: u32, height: u32) -> Result<Self, String> {
        // ── Instance ────────────────────────────────────────────
        let instance = wgpu::Instance::new(wgpu::InstanceDescriptor {
            backends: wgpu::Backends::PRIMARY,
            ..Default::default()
        });

        let adapter = instance
            .request_adapter(&wgpu::RequestAdapterOptions {
                power_preference: wgpu::PowerPreference::HighPerformance,
                compatible_surface: None, // off‑screen only
                force_fallback_adapter: false,
            })
            .await
            .ok_or("No suitable GPU adapter found")?;

        let (device, queue) = adapter
            .request_device(
                &wgpu::DeviceDescriptor {
                    label: Some("dock-genie device"),
                    required_features: wgpu::Features::TEXTURE_ADAPTER_SPECIFIC_FORMAT_FEATURES,
                    required_limits: wgpu::Limits::default(),
                    ..Default::default()
                },
                None,
            )
            .await
            .map_err(|e| format!("Failed to create device: {e}"))?;

        // ── Shader ─────────────────────────────────────────────
        let shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("genie shader"),
            source: wgpu::ShaderSource::Wgsl(Cow::Borrowed(SHADER_SOURCE)),
        });

        // ── Bind group layout ──────────────────────────────────
        let bind_group_layout =
            device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
                label: Some("genie bind group layout"),
                entries: &[
                    // binding 0 — source texture
                    wgpu::BindGroupLayoutEntry {
                        binding: 0,
                        visibility: wgpu::ShaderStages::FRAGMENT,
                        ty: wgpu::BindingType::Texture {
                            sample_type: wgpu::TextureSampleType::Float { filterable: true },
                            view_dimension: wgpu::TextureViewDimension::D2,
                            multisampled: false,
                        },
                        count: None,
                    },
                    // binding 1 — sampler
                    wgpu::BindGroupLayoutEntry {
                        binding: 1,
                        visibility: wgpu::ShaderStages::FRAGMENT,
                        ty: wgpu::BindingType::Sampler(wgpu::SamplerBindingType::Filtering),
                        count: None,
                    },
                    // binding 2 — uniform buffer
                    wgpu::BindGroupLayoutEntry {
                        binding: 2,
                        visibility: wgpu::ShaderStages::FRAGMENT,
                        ty: wgpu::BindingType::Buffer {
                            ty: wgpu::BufferBindingType::Uniform,
                            has_dynamic_offset: false,
                            min_binding_size: None,
                        },
                        count: None,
                    },
                ],
            });

        // ── Pipeline layout ────────────────────────────────────
        let pipeline_layout =
            device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
                label: Some("genie pipeline layout"),
                bind_group_layouts: &[&bind_group_layout],
                push_constant_ranges: &[],
            });

        // ── Render pipeline (full‑screen triangle, no vertex buffer) ──
        let pipeline = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
            label: Some("genie pipeline"),
            layout: Some(&pipeline_layout),
            vertex: wgpu::VertexState {
                module: &shader,
                entry_point: "vs_main",
                buffers: &[], // no vertex buffers — fullscreen tri from @builtin(vertex_index)
                compilation_options: wgpu::PipelineCompilationOptions::default(),
            },
            fragment: Some(wgpu::FragmentState {
                module: &shader,
                entry_point: "fs_main",
                targets: &[Some(wgpu::ColorTargetState {
                    format: wgpu::TextureFormat::Rgba8Unorm,
                    blend: Some(wgpu::BlendState::ALPHA_BLENDING),
                    write_mask: wgpu::ColorWrites::ALL,
                })],
                compilation_options: wgpu::PipelineCompilationOptions::default(),
            }),
            primitive: wgpu::PrimitiveState {
                topology: wgpu::PrimitiveTopology::TriangleList,
                ..Default::default()
            },
            depth_stencil: None,
            multisample: wgpu::MultisampleState::default(),
            multiview: None,
        });

        // ── Sampler ────────────────────────────────────────────
        let sampler = device.create_sampler(&wgpu::SamplerDescriptor {
            label: Some("genie sampler"),
            address_mode_u: wgpu::AddressMode::ClampToEdge,
            address_mode_v: wgpu::AddressMode::ClampToEdge,
            address_mode_w: wgpu::AddressMode::ClampToEdge,
            mag_filter: wgpu::FilterMode::Linear,
            min_filter: wgpu::FilterMode::Linear,
            mipmap_filter: wgpu::FilterMode::Nearest,
            ..Default::default()
        });

        // ── Uniform buffer (initialised with zeros) ─────────────
        let uniform_buffer = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("genie uniforms"),
            contents: bytemuck::bytes_of(&GenieUniforms::zeroed()),
            usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
        });

        // ── Output texture ──────────────────────────────────────
        let (output_texture, output_texture_view) =
            Self::create_output_texture(&device, width, height);

        Ok(Self {
            device,
            queue,
            pipeline,
            bind_group_layout,
            sampler,
            source_texture: None,
            source_texture_view: None,
            output_texture: Some(output_texture),
            output_texture_view: Some(output_texture_view),
            uniform_buffer,
            readback_buffer: None,
            src_width: width,
            src_height: height,
            dst_width: width,
            dst_height: height,
        })
    }

    // ── Public API ───────────────────────────────────────────────

    /// Upload / replace the source window texture.
    ///
    /// `rgba` must contain `width * height * 4` bytes (R, G, B, A per pixel).
    pub fn set_source_texture(&mut self, rgba: &[u8], width: u32, height: u32) {
        self.src_width = width;
        self.src_height = height;

        let texture = self.device.create_texture(&wgpu::TextureDescriptor {
            label: Some("source window texture"),
            size: wgpu::Extent3d {
                width,
                height,
                depth_or_array_layers: 1,
            },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: wgpu::TextureFormat::Rgba8Unorm,
            usage: wgpu::TextureUsages::TEXTURE_BINDING | wgpu::TextureUsages::COPY_DST,
            view_formats: &[],
        });

        let view = texture.create_view(&wgpu::TextureViewDescriptor::default());

        // Upload pixel data — pad rows to satisfy COPY_BYTES_PER_ROW_ALIGNMENT
        let aligned_row = aligned_bytes_per_row(4 * width);
        let src_row_bytes = (4 * width) as usize;
        let padded: Cow<[u8]> = if aligned_row != 4 * width {
            let mut v = vec![0u8; (aligned_row as usize) * (height as usize)];
            for row in 0..height as usize {
                let src_off = row * src_row_bytes;
                let dst_off = row * (aligned_row as usize);
                v[dst_off..dst_off + src_row_bytes]
                    .copy_from_slice(&rgba[src_off..src_off + src_row_bytes]);
            }
            Cow::Owned(v)
        } else {
            Cow::Borrowed(rgba)
        };

        self.queue.write_texture(
            wgpu::ImageCopyTexture {
                texture: &texture,
                mip_level: 0,
                origin: wgpu::Origin3d::ZERO,
                aspect: wgpu::TextureAspect::All,
            },
            &padded,
            wgpu::ImageDataLayout {
                offset: 0,
                bytes_per_row: Some(aligned_row),
                rows_per_image: Some(height),
            },
            wgpu::Extent3d {
                width,
                height,
                depth_or_array_layers: 1,
            },
        );

        self.source_texture = Some(texture);
        self.source_texture_view = Some(view);
    }

    /// Ensure the output texture matches the requested dimensions.
    pub fn resize_output(&mut self, width: u32, height: u32) {
        if self.dst_width == width && self.dst_height == height && self.output_texture.is_some() {
            return;
        }
        self.dst_width = width;
        self.dst_height = height;
        let (tex, view) = Self::create_output_texture(&self.device, width, height);
        self.output_texture = Some(tex);
        self.output_texture_view = Some(view);
        self.readback_buffer = None; // invalidated
    }

    /// Render one frame using the supplied uniforms, returning the result as
    /// raw RGBA bytes.
    ///
    /// Panics if no source texture has been set via [`set_source_texture`].
    pub fn render_frame(&mut self, uniforms: &GenieUniforms) -> Vec<u8> {
        let src_view = self
            .source_texture_view
            .as_ref()
            .expect("set_source_texture must be called before render_frame");

        let dst_view = self
            .output_texture_view
            .as_ref()
            .expect("output texture not initialised");

        // ── Update uniform buffer ────────────────────────────
        self.queue
            .write_buffer(&self.uniform_buffer, 0, bytemuck::bytes_of(uniforms));

        // ── Build / rebuild bind group ───────────────────────
        // (We rebuild it each frame for simplicity; a real impl would cache.)
        let bind_group = self.device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("genie bind group"),
            layout: &self.bind_group_layout,
            entries: &[
                wgpu::BindGroupEntry {
                    binding: 0,
                    resource: wgpu::BindingResource::TextureView(src_view),
                },
                wgpu::BindGroupEntry {
                    binding: 1,
                    resource: wgpu::BindingResource::Sampler(&self.sampler),
                },
                wgpu::BindGroupEntry {
                    binding: 2,
                    resource: self.uniform_buffer.as_entire_binding(),
                },
            ],
        });

        // ── Render pass ──────────────────────────────────────
        let mut encoder = self
            .device
            .create_command_encoder(&wgpu::CommandEncoderDescriptor {
                label: Some("genie encoder"),
            });

        {
            let mut rp = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("genie render pass"),
                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                    view: dst_view,
                    resolve_target: None,
                    ops: wgpu::Operations {
                        load: wgpu::LoadOp::Clear(wgpu::Color {
                            r: 0.0,
                            g: 0.0,
                            b: 0.0,
                            a: 0.0,
                        }),
                        store: wgpu::StoreOp::Store,
                    },
                })],
                depth_stencil_attachment: None,
                timestamp_writes: None,
                occlusion_query_set: None,
            });

            rp.set_pipeline(&self.pipeline);
            rp.set_bind_group(0, &bind_group, &[]);
            // Draw 3 vertices → a single full‑screen triangle
            rp.draw(0..3, 0..1);
        }

        // ── Read back ────────────────────────────────────────
        let aligned_row_bytes = aligned_bytes_per_row(4 * self.dst_width);
        let byte_count = (aligned_row_bytes as u64) * (self.dst_height as u64);

        // Ensure readback buffer is large enough
        let need_new = self
            .readback_buffer
            .as_ref()
            .map_or(true, |b| b.size() < byte_count);

        if need_new {
            self.readback_buffer = Some(self.device.create_buffer(&wgpu::BufferDescriptor {
                label: Some("readback buffer"),
                size: byte_count,
                usage: wgpu::BufferUsages::COPY_DST | wgpu::BufferUsages::MAP_READ,
                mapped_at_creation: false,
            }));
        }

        let readback = self.readback_buffer.as_ref().unwrap();

        encoder.copy_texture_to_buffer(
            wgpu::ImageCopyTexture {
                texture: self.output_texture.as_ref().unwrap(),
                mip_level: 0,
                origin: wgpu::Origin3d::ZERO,
                aspect: wgpu::TextureAspect::All,
            },
            wgpu::ImageCopyBuffer {
                buffer: readback,
                layout: wgpu::ImageDataLayout {
                    offset: 0,
                    bytes_per_row: Some(aligned_row_bytes),
                    rows_per_image: Some(self.dst_height),
                },
            },
            wgpu::Extent3d {
                width: self.dst_width,
                height: self.dst_height,
                depth_or_array_layers: 1,
            },
        );

        self.queue.submit(Some(encoder.finish()));

        // ── Map and read ─────────────────────────────────────
        let slice = readback.slice(..);
        slice.map_async(wgpu::MapMode::Read, |_| {});
        self.device.poll(wgpu::Maintain::Wait);

        let data = slice.get_mapped_range();
        let result = data.to_vec();
        drop(data);
        readback.unmap();

        result
    }

    // ── Internal helpers ──────────────────────────────────────

    fn create_output_texture(
        device: &wgpu::Device,
        width: u32,
        height: u32,
    ) -> (wgpu::Texture, wgpu::TextureView) {
        let texture = device.create_texture(&wgpu::TextureDescriptor {
            label: Some("output texture"),
            size: wgpu::Extent3d {
                width,
                height,
                depth_or_array_layers: 1,
            },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: wgpu::TextureFormat::Rgba8Unorm,
            usage: wgpu::TextureUsages::RENDER_ATTACHMENT
                | wgpu::TextureUsages::COPY_SRC
                | wgpu::TextureUsages::TEXTURE_BINDING,
            view_formats: &[],
        });
        let view = texture.create_view(&wgpu::TextureViewDescriptor::default());
        (texture, view)
    }
}
