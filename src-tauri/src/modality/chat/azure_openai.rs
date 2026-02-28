use super::ir::*;
use super::openai_chat::OpenAiChatCodec;
use super::{Decoder, Encoder};
use crate::error::AppError;

/// Azure OpenAI — 与 OpenAI Chat 格式相同，全部委托给 OpenAiChatCodec。
/// 认证方式不同（api-key header），由 proxy.rs 层处理。
pub struct AzureOpenAiCodec;

impl Decoder for AzureOpenAiCodec {
    fn decode_request(&self, body: &[u8]) -> Result<IrChatRequest, AppError> {
        OpenAiChatCodec.decode_request(body)
    }

    fn decode_response(&self, body: &[u8]) -> Result<IrChatResponse, AppError> {
        OpenAiChatCodec.decode_response(body)
    }

    fn decode_stream_chunk(&self, data: &str) -> Result<Option<IrStreamChunk>, AppError> {
        OpenAiChatCodec.decode_stream_chunk(data)
    }

    fn is_stream_done(&self, data: &str) -> bool {
        OpenAiChatCodec.is_stream_done(data)
    }
}

impl Encoder for AzureOpenAiCodec {
    fn encode_request(&self, ir: &IrChatRequest, model: &str) -> Result<Vec<u8>, AppError> {
        OpenAiChatCodec.encode_request(ir, model)
    }

    fn encode_response(&self, ir: &IrChatResponse) -> Result<Vec<u8>, AppError> {
        OpenAiChatCodec.encode_response(ir)
    }

    fn encode_stream_chunk(&mut self, chunk: &IrStreamChunk) -> Result<Option<String>, AppError> {
        OpenAiChatCodec.encode_stream_chunk(chunk)
    }

    fn stream_done_signal(&mut self) -> Option<String> {
        Some("[DONE]".to_string())
    }
}
