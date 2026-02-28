use crate::error::AppError;
use serde::{de::DeserializeOwned, Serialize};

/// Deserialize JSON bytes, wrapping errors as AppError::Codec.
pub fn from_json<T: DeserializeOwned>(data: &[u8]) -> Result<T, AppError> {
    serde_json::from_slice(data).map_err(|e| AppError::Codec(e.to_string()))
}

/// Deserialize JSON string, wrapping errors as AppError::Codec.
pub fn from_json_str<T: DeserializeOwned>(data: &str) -> Result<T, AppError> {
    serde_json::from_str(data).map_err(|e| AppError::Codec(e.to_string()))
}

/// Deserialize serde_json::Value, wrapping errors as AppError::Codec.
pub fn from_json_value<T: DeserializeOwned>(value: serde_json::Value) -> Result<T, AppError> {
    serde_json::from_value(value).map_err(|e| AppError::Codec(e.to_string()))
}

/// Serialize value to JSON bytes, wrapping errors as AppError::Codec.
pub fn to_json<T: Serialize>(value: &T) -> Result<Vec<u8>, AppError> {
    serde_json::to_vec(value).map_err(|e| AppError::Codec(e.to_string()))
}

/// Serialize value to JSON string, wrapping errors as AppError::Codec.
pub fn to_json_str<T: Serialize>(value: &T) -> Result<String, AppError> {
    serde_json::to_string(value).map_err(|e| AppError::Codec(e.to_string()))
}
