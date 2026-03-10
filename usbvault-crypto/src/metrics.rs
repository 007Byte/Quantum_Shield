//! DE-019 FIX: Observability for crypto operations
//! Provides timing and error tracking for encryption/decryption

use std::time::Instant;

/// Track timing of a crypto operation
pub struct CryptoTimer {
    operation: &'static str,
    start: Instant,
}

impl CryptoTimer {
    pub fn new(operation: &'static str) -> Self {
        CryptoTimer {
            operation,
            start: Instant::now(),
        }
    }

    pub fn elapsed_micros(&self) -> u128 {
        self.start.elapsed().as_micros()
    }
}

impl Drop for CryptoTimer {
    fn drop(&mut self) {
        let elapsed = self.start.elapsed();
        // In production, this would emit metrics to a monitoring system
        if elapsed.as_millis() > 100 {
            eprintln!(
                "DE-019 WARN: slow crypto operation '{}' took {}ms",
                self.operation,
                elapsed.as_millis()
            );
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::thread;
    use std::time::Duration;

    #[test]
    fn test_crypto_timer() {
        let timer = CryptoTimer::new("test_op");
        thread::sleep(Duration::from_millis(10));
        assert!(timer.elapsed_micros() >= 10_000);
    }
}
