use bumpalo::Bump;
use jsonata_rs::JsonAta;

use crate::error::AppError;

/// Evaluate a JSONata expression against the given JSON input and return the result.
pub fn evaluate(expression: &str, input: &serde_json::Value) -> Result<serde_json::Value, AppError> {
    let arena = Bump::new();
    let jsonata = JsonAta::new(expression, &arena)
        .map_err(|e| AppError::Codec(format!("JSONata parse error: {e}")))?;

    let input_str = serde_json::to_string(input)
        .map_err(|e| AppError::Codec(format!("Failed to serialize input: {e}")))?;

    let result = jsonata
        .evaluate(Some(&input_str), None)
        .map_err(|e| AppError::Codec(format!("JSONata evaluation error: {e}")))?;

    let result_str = result.serialize(false);
    let value: serde_json::Value = serde_json::from_str(&result_str)
        .map_err(|e| AppError::Codec(format!("Failed to parse JSONata result: {e}")))?;

    Ok(value)
}

/// Validate that a JSONata expression is syntactically correct.
pub fn validate(expression: &str) -> Result<(), String> {
    let arena = Bump::new();
    JsonAta::new(expression, &arena)
        .map_err(|e| format!("Invalid JSONata expression: {e}"))?;
    Ok(())
}
