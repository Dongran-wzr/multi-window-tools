//! Easing functions used by the animation state machine.
//!
//! All functions map time t ∈ [0, 1] → output ∈ [0, 1].
//! Naming follows CSS easing conventions.

/// easeOutCubic — fast start, gradual deceleration (used for X‑axis displacement)
#[inline]
pub fn ease_out_cubic(t: f32) -> f32 {
    let t1 = 1.0 - t;
    1.0 - t1 * t1 * t1
}

/// easeInQuart — slow start, rapid acceleration (used for Y‑axis displacement
/// to create the "falling into dock" arc)
#[inline]
pub fn ease_in_quart(t: f32) -> f32 {
    t * t * t * t
}

/// easeInQuad — used for the overall scale-down, slight acceleration
#[inline]
pub fn ease_in_quad(t: f32) -> f32 {
    t * t
}

/// easeOutExpo — fast initial move, extreme deceleration at the end
/// (used for perspective angle to snap quickly then settle)
#[inline]
pub fn ease_out_expo(t: f32) -> f32 {
    if t >= 1.0 {
        1.0
    } else {
        1.0 - (2.0_f32).powf(-10.0 * t)
    }
}

/// easeInOutQuad — symmetric acceleration then deceleration
/// (used for opacity fade at the very end)
#[inline]
pub fn ease_in_out_quad(t: f32) -> f32 {
    if t < 0.5 {
        2.0 * t * t
    } else {
        let t1 = -2.0 * t + 2.0;
        1.0 - t1 * t1 / 2.0
    }
}

/// Linear interpolation
#[inline]
pub fn lerp(a: f32, b: f32, t: f32) -> f32 {
    a + (b - a) * t
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn endpoints() {
        for f in [ease_out_cubic, ease_in_quart, ease_in_quad, ease_out_expo] {
            assert!((f(0.0) - 0.0).abs() < 1e-6);
            assert!((f(1.0) - 1.0).abs() < 1e-6);
        }
    }

    #[test]
    fn monotonic() {
        for f in [ease_out_cubic, ease_in_quart, ease_in_quad, ease_out_expo] {
            let mut prev = 0.0;
            for i in 0..=100 {
                let t = i as f32 / 100.0;
                let v = f(t);
                assert!(v >= prev, "not monotonic at t={t}");
                prev = v;
            }
        }
    }
}
