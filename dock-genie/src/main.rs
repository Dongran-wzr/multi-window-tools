//! Demo binary — renders the Genie animation in a live window.
//!
//! A synthetic "terminal window" texture is generated and animated
//! toward a simulated Dock icon at the bottom of the window.

use std::borrow::Cow;
use std::sync::Arc;
use std::time::Instant;

use dock_genie::{AnimationState, DockTarget, GenieConfig, GenieRenderer};
use wgpu::util::DeviceExt;
use winit::{
    application::ApplicationHandler,
    event::WindowEvent,
    event_loop::{ActiveEventLoop, EventLoop},
    window::{Window, WindowAttributes},
};

// ---------------------------------------------------------------------------
// Generate a synthetic terminal‑window texture
// ---------------------------------------------------------------------------

/// Returns RGBA bytes for a fake terminal window (dark background, titlebar,
/// coloured text lines).
fn make_terminal_texture(width: u32, height: u32) -> Vec<u8> {
    let mut pixels = vec![0u8; (width * height * 4) as usize];

    for y in 0..height {
        for x in 0..width {
            let idx = ((y * width + x) * 4) as usize;

            // Titlebar (top 32 px)
            if y < 32 {
                pixels[idx] = 30; // R
                pixels[idx + 1] = 33; // G
                pixels[idx + 2] = 39; // B
                pixels[idx + 3] = 255; // A
                continue;
            }

            // Background
            let bg_r = 26u8;
            let bg_g = 29u8;
            let bg_b = 35u8;

            // Fake text lines (every 20 px)
            let line_y = (y - 32) / 20;
            let in_text = (y - 32) % 20 < 2;
            let _text_x = if line_y % 3 == 0 {
                // green prompt
                if in_text && x > 15 && x < 200 {
                    pixels[idx] = 152;
                    pixels[idx + 1] = 195;
                    pixels[idx + 2] = 121;
                    pixels[idx + 3] = 255;
                    continue;
                }
                false
            } else if line_y % 3 == 1 {
                // white output
                if in_text && x > 15 && x < 400 {
                    pixels[idx] = 200;
                    pixels[idx + 1] = 210;
                    pixels[idx + 2] = 220;
                    pixels[idx + 3] = 255;
                    continue;
                }
                false
            } else {
                false
            };

            pixels[idx] = bg_r;
            pixels[idx + 1] = bg_g;
            pixels[idx + 2] = bg_b;
            pixels[idx + 3] = 255;
        }
    }

    // Titlebar dots (red / yellow / green)
    for (cx, r, g, b) in [(20i32, 248u8, 113u8, 113u8), (32, 229, 192, 123), (44, 152, 195, 121)] {
        for dy in -3i32..=3 {
            for dx in -3i32..=3 {
                if dx * dx + dy * dy <= 9 {
                    let px = (cx as i32 + dx).max(0).min(width as i32 - 1) as u32;
                    let py = (16i32 + dy).max(0).min(height as i32 - 1) as u32;
                    let i = ((py * width + px) * 4) as usize;
                    pixels[i] = r;
                    pixels[i + 1] = g;
                    pixels[i + 2] = b;
                    pixels[i + 3] = 255;
                }
            }
        }
    }

    pixels
}

// ---------------------------------------------------------------------------
// WGPU + Win32 surface renderer
// ---------------------------------------------------------------------------

struct AppState {
    window: Arc<Window>,

    // wgpu surface
    surface: wgpu::Surface<'static>,
    surface_config: wgpu::SurfaceConfiguration,
    device: wgpu::Device,
    queue: wgpu::Queue,

    // Display pipeline (copy off‑screen output to surface)
    display_pipeline: wgpu::RenderPipeline,
    display_bind_group_layout: wgpu::BindGroupLayout,

    // Genie renderer
    genie: GenieRenderer,
    animation: AnimationState,

    // Full‑screen quad for display
    vertex_buffer: wgpu::Buffer,
    index_buffer: wgpu::Buffer,
    index_count: u32,

    // Timing
    last_frame: Instant,
}

#[repr(C)]
#[derive(Copy, Clone, bytemuck::Pod, bytemuck::Zeroable)]
struct DisplayVertex {
    pos: [f32; 2],
    uv: [f32; 2],
}

/// Round `bytes` up to the next multiple of `COPY_BYTES_PER_ROW_ALIGNMENT` (256).
const fn aligned_bytes_per_row(bytes: u32) -> u32 {
    (bytes + 255) & !255
}

impl AppState {
    async fn new(window: Window) -> Self {
        let window = Arc::new(window);
        let size = window.inner_size();

        // ── WGPU setup ───────────────────────────────────────
        let instance = wgpu::Instance::new(wgpu::InstanceDescriptor::default());
        let surface = instance.create_surface(window.clone()).unwrap();

        let adapter = instance
            .request_adapter(&wgpu::RequestAdapterOptions {
                power_preference: wgpu::PowerPreference::HighPerformance,
                compatible_surface: Some(&surface),
                force_fallback_adapter: false,
            })
            .await
            .expect("No adapter");

        let (device, queue) = adapter
            .request_device(&wgpu::DeviceDescriptor::default(), None)
            .await
            .unwrap();

        let surface_caps = surface.get_capabilities(&adapter);
        let surface_format = surface_caps
            .formats
            .iter()
            .find(|f| f.is_srgb())
            .copied()
            .unwrap_or(surface_caps.formats[0]);

        let surface_config = wgpu::SurfaceConfiguration {
            usage: wgpu::TextureUsages::RENDER_ATTACHMENT,
            format: surface_format,
            width: size.width,
            height: size.height,
            present_mode: wgpu::PresentMode::AutoVsync,
            alpha_mode: surface_caps.alpha_modes[0],
            view_formats: vec![],
            desired_maximum_frame_latency: 2,
        };
        surface.configure(&device, &surface_config);

        // ── Display pipeline (simple textured quad) ──────────
        let display_shader =
            device.create_shader_module(wgpu::ShaderModuleDescriptor {
                label: Some("display shader"),
                source: wgpu::ShaderSource::Wgsl(Cow::Borrowed(DISPLAY_SHADER)),
            });

        let display_bind_group_layout =
            device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
                label: Some("display bind group"),
                entries: &[
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
                    wgpu::BindGroupLayoutEntry {
                        binding: 1,
                        visibility: wgpu::ShaderStages::FRAGMENT,
                        ty: wgpu::BindingType::Sampler(wgpu::SamplerBindingType::Filtering),
                        count: None,
                    },
                ],
            });

        let display_pipeline_layout =
            device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
                label: Some("display pipeline layout"),
                bind_group_layouts: &[&display_bind_group_layout],
                push_constant_ranges: &[],
            });

        let display_pipeline =
            device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
                label: Some("display pipeline"),
                layout: Some(&display_pipeline_layout),
                vertex: wgpu::VertexState {
                    module: &display_shader,
                    entry_point: "vs_main",
                    buffers: &[wgpu::VertexBufferLayout {
                        array_stride: std::mem::size_of::<DisplayVertex>() as u64,
                        step_mode: wgpu::VertexStepMode::Vertex,
                        attributes: &[
                            wgpu::VertexAttribute {
                                format: wgpu::VertexFormat::Float32x2,
                                offset: 0,
                                shader_location: 0,
                            },
                            wgpu::VertexAttribute {
                                format: wgpu::VertexFormat::Float32x2,
                                offset: 8,
                                shader_location: 1,
                            },
                        ],
                    }],
                    compilation_options: wgpu::PipelineCompilationOptions::default(),
                },
                fragment: Some(wgpu::FragmentState {
                    module: &display_shader,
                    entry_point: "fs_main",
                    targets: &[Some(wgpu::ColorTargetState {
                        format: surface_format,
                        blend: Some(wgpu::BlendState::ALPHA_BLENDING),
                        write_mask: wgpu::ColorWrites::ALL,
                    })],
                    compilation_options: wgpu::PipelineCompilationOptions::default(),
                }),
                primitive: wgpu::PrimitiveState::default(),
                depth_stencil: None,
                multisample: wgpu::MultisampleState::default(),
                multiview: None,
            });

        // ── Full‑screen quad geometry ────────────────────────
        let vertices = [
            DisplayVertex { pos: [-1.0, -1.0], uv: [0.0, 1.0] },
            DisplayVertex { pos: [ 1.0, -1.0], uv: [1.0, 1.0] },
            DisplayVertex { pos: [ 1.0,  1.0], uv: [1.0, 0.0] },
            DisplayVertex { pos: [-1.0,  1.0], uv: [0.0, 0.0] },
        ];
        let indices: [u16; 6] = [0, 1, 2, 0, 2, 3];

        let vertex_buffer = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("display vertices"),
            contents: bytemuck::cast_slice(&vertices),
            usage: wgpu::BufferUsages::VERTEX,
        });
        let index_buffer = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("display indices"),
            contents: bytemuck::cast_slice(&indices),
            usage: wgpu::BufferUsages::INDEX,
        });

        // ── Genie renderer ───────────────────────────────────
        let w = size.width.max(1);
        let h = size.height.max(1);
        let mut genie = GenieRenderer::new(w, h).await.expect("genie init");

        // Generate a fake terminal texture
        let tex_w = 800u32;
        let tex_h = 500u32;
        let tex_rgba = make_terminal_texture(tex_w, tex_h);
        genie.set_source_texture(&tex_rgba, tex_w, tex_h);

        // ── Animation config ─────────────────────────────────
        let config = GenieConfig {
            duration_ms: 250.0,
            dock: DockTarget {
                center_x: 0.5,
                bottom_y: 0.95,
                icon_width: 120.0,
                icon_height: 36.0,
            },
            src_width: tex_w as f32,
            src_height: tex_h as f32,
            dst_width: w as f32,
            dst_height: h as f32,
            ..Default::default()
        };

        Self {
            window,
            surface,
            surface_config,
            device,
            queue,
            display_pipeline,
            display_bind_group_layout,
            genie,
            animation: AnimationState::new(config),
            vertex_buffer,
            index_buffer,
            index_count: indices.len() as u32,
            last_frame: Instant::now(),
        }
    }

    fn render(&mut self) {
        let dt = self.last_frame.elapsed().as_secs_f32() * 1000.0;
        self.last_frame = Instant::now();

        // Tick animation
        let uniforms = self.animation.tick(dt);
        let frame_rgba = self.genie.render_frame(uniforms);

        let (w, h) = (self.surface_config.width, self.surface_config.height);

        // Upload frame to a texture for display
        let display_tex = self.device.create_texture(&wgpu::TextureDescriptor {
            label: Some("display texture"),
            size: wgpu::Extent3d {
                width: w,
                height: h,
                depth_or_array_layers: 1,
            },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: wgpu::TextureFormat::Rgba8Unorm,
            usage: wgpu::TextureUsages::TEXTURE_BINDING | wgpu::TextureUsages::COPY_DST,
            view_formats: &[],
        });
        self.queue.write_texture(
            wgpu::ImageCopyTexture {
                texture: &display_tex,
                mip_level: 0,
                origin: wgpu::Origin3d::ZERO,
                aspect: wgpu::TextureAspect::All,
            },
            &frame_rgba,
            wgpu::ImageDataLayout {
                offset: 0,
                bytes_per_row: Some(aligned_bytes_per_row(4 * w)),
                rows_per_image: Some(h),
            },
            wgpu::Extent3d {
                width: w,
                height: h,
                depth_or_array_layers: 1,
            },
        );
        let display_view = display_tex.create_view(&wgpu::TextureViewDescriptor::default());

        let display_sampler = self.device.create_sampler(&wgpu::SamplerDescriptor {
            label: Some("display sampler"),
            address_mode_u: wgpu::AddressMode::ClampToEdge,
            address_mode_v: wgpu::AddressMode::ClampToEdge,
            address_mode_w: wgpu::AddressMode::ClampToEdge,
            mag_filter: wgpu::FilterMode::Linear,
            min_filter: wgpu::FilterMode::Linear,
            ..Default::default()
        });

        let display_bind_group = self.device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("display bind group"),
            layout: &self.display_bind_group_layout,
            entries: &[
                wgpu::BindGroupEntry {
                    binding: 0,
                    resource: wgpu::BindingResource::TextureView(&display_view),
                },
                wgpu::BindGroupEntry {
                    binding: 1,
                    resource: wgpu::BindingResource::Sampler(&display_sampler),
                },
            ],
        });

        // ── Acquire surface ───────────────────────────────────
        let output = match self.surface.get_current_texture() {
            Ok(t) => t,
            Err(wgpu::SurfaceError::Outdated) => {
                self.surface.configure(&self.device, &self.surface_config);
                return;
            }
            Err(e) => {
                log::error!("Surface error: {e}");
                return;
            }
        };
        let output_view = output
            .texture
            .create_view(&wgpu::TextureViewDescriptor::default());

        let mut encoder = self
            .device
            .create_command_encoder(&wgpu::CommandEncoderDescriptor::default());

        {
            let mut rp = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("display pass"),
                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                    view: &output_view,
                    resolve_target: None,
                    ops: wgpu::Operations {
                        load: wgpu::LoadOp::Clear(wgpu::Color::BLACK),
                        store: wgpu::StoreOp::Store,
                    },
                })],
                depth_stencil_attachment: None,
                timestamp_writes: None,
                occlusion_query_set: None,
            });

            rp.set_pipeline(&self.display_pipeline);
            rp.set_bind_group(0, &display_bind_group, &[]);
            rp.set_vertex_buffer(0, self.vertex_buffer.slice(..));
            rp.set_index_buffer(self.index_buffer.slice(..), wgpu::IndexFormat::Uint16);
            rp.draw_indexed(0..self.index_count, 0, 0..1);
        }

        self.queue.submit(Some(encoder.finish()));
        output.present();

        // Restart animation when it finishes
        if self.animation.is_finished() {
            self.animation.reset();
        }
    }
}

const DISPLAY_SHADER: &str = r#"
struct VertexOutput {
    @builtin(position) pos: vec4<f32>,
    @location(1) uv: vec2<f32>,
}

@vertex
fn vs_main(@location(0) pos: vec2<f32>, @location(1) uv: vec2<f32>) -> VertexOutput {
    return VertexOutput(vec4(pos, 0.0, 1.0), uv);
}

@group(0) @binding(0) var tex: texture_2d<f32>;
@group(0) @binding(1) var smp: sampler;

@fragment
fn fs_main(@location(1) uv: vec2<f32>) -> @location(0) vec4<f32> {
    return textureSample(tex, smp, uv);
}
"#;

// Work around winit 0.30's Window lifetime constraints.
// Our AppState actually owns the Window (via Arc), so this is safe.
unsafe impl Send for AppState {}
unsafe impl Sync for AppState {}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

fn main() {
    env_logger::init();

    let event_loop = EventLoop::new().expect("event loop");

    // We'll store AppState in an Option so we can take it in resumed().
    let state: Option<AppState> = None;

    let mut app = AppHandler { state };

    event_loop.run_app(&mut app).expect("event loop run");
}

struct AppHandler {
    state: Option<AppState>,
}

impl ApplicationHandler for AppHandler {
    fn resumed(&mut self, event_loop: &ActiveEventLoop) {
        if self.state.is_none() {
            let window = event_loop
                .create_window(
                    WindowAttributes::default()
                        .with_title("Dock Genie — macOS‑style animation")
                        .with_inner_size(winit::dpi::LogicalSize::new(900, 650)),
                )
                .expect("create window");

            let app = pollster::block_on(AppState::new(window));
            self.state = Some(app);
        }
    }

    fn window_event(
        &mut self,
        event_loop: &ActiveEventLoop,
        _window_id: winit::window::WindowId,
        event: WindowEvent,
    ) {
        match event {
            WindowEvent::CloseRequested => event_loop.exit(),
            WindowEvent::RedrawRequested => {
                if let Some(ref mut app) = self.state {
                    app.render();
                    app.window.request_redraw();
                }
            }
            _ => {}
        }
    }
}
