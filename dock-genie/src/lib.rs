//! # dock-genie
//!
//! macOS‑style Genie "suck into Dock" animation effect.
//!
//! ```no_run
//! use dock_genie::{AnimationState, GenieConfig, GenieRenderer};
//!
//! # async fn demo() -> Result<(), String> {
//! let config = GenieConfig::default();
//! let mut state = AnimationState::new(config);
//! let mut renderer = GenieRenderer::new(800, 600).await?;
//! renderer.set_source_texture(&window_rgba, 800, 600);
//!
//! while !state.is_finished() {
//!     let uniforms = state.tick(16);  // ~60 fps
//!     let frame_rgba = renderer.render_frame(uniforms);
//!     // … display frame_rgba …
//! }
//! # Ok(())
//! # }
//! ```

pub mod animation;
pub mod easing;
pub mod renderer;

pub use animation::{AnimationState, DockTarget, GenieConfig, GenieUniforms};
pub use renderer::GenieRenderer;
