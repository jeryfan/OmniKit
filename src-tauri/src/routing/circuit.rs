use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{Duration, Instant};

#[derive(Debug, Clone, PartialEq)]
enum CircuitState {
    Closed,   // healthy — requests flow normally
    Open,     // disabled — all requests rejected
    HalfOpen, // probing — allow one request to test
}

struct ChannelCircuit {
    consecutive_failures: u32,
    state: CircuitState,
    last_failure: Option<Instant>,
}

pub struct CircuitBreaker {
    states: Mutex<HashMap<String, ChannelCircuit>>,
    failure_threshold: u32,
    cooldown: Duration,
}

impl CircuitBreaker {
    pub fn new(failure_threshold: u32, cooldown_secs: u64) -> Self {
        Self {
            states: Mutex::new(HashMap::new()),
            failure_threshold,
            cooldown: Duration::from_secs(cooldown_secs),
        }
    }

    /// Check if a channel is available for requests.
    /// Returns true if closed or half-open (probe allowed).
    pub fn is_available(&self, channel_id: &str) -> bool {
        let mut states = self.states.lock().unwrap();
        let circuit = match states.get_mut(channel_id) {
            Some(c) => c,
            None => return true, // no state = healthy
        };

        match circuit.state {
            CircuitState::Closed => true,
            CircuitState::Open => {
                // Check if cooldown has elapsed → transition to half-open
                if let Some(last_fail) = circuit.last_failure {
                    if last_fail.elapsed() >= self.cooldown {
                        circuit.state = CircuitState::HalfOpen;
                        return true;
                    }
                }
                false
            }
            CircuitState::HalfOpen => true, // allow one probe request
        }
    }

    /// Record a successful request — close the circuit.
    pub fn record_success(&self, channel_id: &str) {
        let mut states = self.states.lock().unwrap();
        if let Some(circuit) = states.get_mut(channel_id) {
            circuit.consecutive_failures = 0;
            circuit.state = CircuitState::Closed;
        }
    }

    /// Record a failed request — increment failures, possibly open circuit.
    pub fn record_failure(&self, channel_id: &str) {
        let mut states = self.states.lock().unwrap();
        let circuit = states.entry(channel_id.to_string()).or_insert(ChannelCircuit {
            consecutive_failures: 0,
            state: CircuitState::Closed,
            last_failure: None,
        });

        circuit.consecutive_failures += 1;
        circuit.last_failure = Some(Instant::now());

        if circuit.consecutive_failures >= self.failure_threshold {
            circuit.state = CircuitState::Open;
        }
    }
}
