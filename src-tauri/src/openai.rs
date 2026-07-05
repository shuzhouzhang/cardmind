use crate::extractor::extract_knowledge_cards;
use crate::models::{ExtractionPreview, ExtractionResult};
use reqwest::blocking::Client;
use reqwest::StatusCode;
use serde_json::{json, Value};

const OPENAI_RESPONSES_URL: &str = "https://api.openai.com/v1/responses";

pub fn extract_with_openai_or_mock(
    conversation_text: &str,
    api_key: Option<String>,
    model: &str,
) -> ExtractionPreview {
    let Some(api_key) = api_key.filter(|key| !key.trim().is_empty()) else {
        let fallback = extract_knowledge_cards(conversation_text);
        return ExtractionPreview {
            cards: fallback.cards,
            relations: fallback.relations,
            provider: "mock".to_string(),
            warning: Some("未配置 OpenAI API Key，已使用本地 mock 抽取。".to_string()),
        };
    };

    match call_openai(conversation_text, &api_key, model) {
        Ok(extraction) => ExtractionPreview {
            cards: extraction.cards,
            relations: extraction.relations,
            provider: "openai".to_string(),
            warning: None,
        },
        Err(error) => {
            let fallback = extract_knowledge_cards(conversation_text);
            ExtractionPreview {
                cards: fallback.cards,
                relations: fallback.relations,
                provider: "mock".to_string(),
                warning: Some(format!("OpenAI 抽取失败，已回退到本地 mock：{error}")),
            }
        }
    }
}

pub fn test_openai_connection(api_key: Option<String>, model: &str) -> Result<(), String> {
    let api_key = api_key
        .filter(|key| !key.trim().is_empty())
        .ok_or_else(|| "未配置 OpenAI API Key。请先粘贴 Key，或设置环境变量 OPENAI_API_KEY。".to_string())?;

    let client = Client::new();
    let response = client
        .post(OPENAI_RESPONSES_URL)
        .bearer_auth(api_key)
        .json(&json!({
            "model": model,
            "input": "请只回复 OK，用于验证 CardMind 的 OpenAI 连接。"
        }))
        .send()
        .map_err(|error| format!("无法连接 OpenAI：{error}"))?;

    if response.status().is_success() {
        return Ok(());
    }

    Err(format_openai_error(response.status(), response.text().unwrap_or_default()))
}

fn call_openai(
    conversation_text: &str,
    api_key: &str,
    model: &str,
) -> Result<ExtractionResult, String> {
    let client = Client::new();
    let response = client
        .post(OPENAI_RESPONSES_URL)
        .bearer_auth(api_key)
        .json(&json!({
            "model": model,
            "input": [
                {
                    "role": "system",
                    "content": "你是 CardMind 的知识卡片抽取器。只提取可复习、可连接的知识点；不要把整段对话保存成 Markdown。输出必须严格符合 JSON schema。"
                },
                {
                    "role": "user",
                    "content": format!("请从下面 AI 对话中抽取知识卡片和关系：\n\n{}", conversation_text)
                }
            ],
            "text": {
                "format": {
                    "type": "json_schema",
                    "name": "cardmind_extraction",
                    "schema": extraction_schema(),
                    "strict": true
                }
            }
        }))
        .send()
        .map_err(|error| error.to_string())?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().unwrap_or_default();
        return Err(format_openai_error(status, body));
    }

    let value = response.json::<Value>().map_err(|error| error.to_string())?;
    let text = extract_output_text(&value).ok_or_else(|| "OpenAI 响应中没有可解析文本。".to_string())?;
    let extraction = serde_json::from_str::<ExtractionResult>(&text).map_err(|error| error.to_string())?;
    validate_extraction(&extraction)?;
    Ok(extraction)
}

fn format_openai_error(status: StatusCode, body: String) -> String {
    let lower_body = body.to_lowercase();
    let hint = match status.as_u16() {
        401 => "API Key 无效或已过期。",
        403 => "当前账号没有权限访问该模型或接口。",
        404 => "模型不存在，或当前账号不可用这个模型。",
        429 => "请求过于频繁或额度不足。",
        500..=599 => "OpenAI 服务暂时不可用。",
        _ if lower_body.contains("model") => "请检查模型名称和账号权限。",
        _ => "请检查网络、API Key 和模型设置。",
    };
    let compact_body = body.chars().take(500).collect::<String>();
    format!("OpenAI HTTP {status}：{hint} 原始错误：{compact_body}")
}

fn extraction_schema() -> Value {
    json!({
        "type": "object",
        "additionalProperties": false,
        "required": ["cards", "relations"],
        "properties": {
            "cards": {
                "type": "array",
                "items": {
                    "type": "object",
                    "additionalProperties": false,
                    "required": ["title", "summary", "content", "type", "tags"],
                    "properties": {
                        "title": { "type": "string" },
                        "summary": { "type": "string" },
                        "content": { "type": "string" },
                        "type": { "type": "string" },
                        "tags": { "type": "array", "items": { "type": "string" } }
                    }
                }
            },
            "relations": {
                "type": "array",
                "items": {
                    "type": "object",
                    "additionalProperties": false,
                    "required": ["source_title", "target_title", "relation_type", "reason", "confidence"],
                    "properties": {
                        "source_title": { "type": "string" },
                        "target_title": { "type": "string" },
                        "relation_type": {
                            "type": "string",
                            "enum": ["prerequisite", "contains", "related", "contrast", "application", "source", "supports"]
                        },
                        "reason": { "type": "string" },
                        "confidence": { "type": "number", "minimum": 0, "maximum": 1 }
                    }
                }
            }
        }
    })
}

fn extract_output_text(value: &Value) -> Option<String> {
    if let Some(text) = value.get("output_text").and_then(Value::as_str) {
        return Some(text.to_string());
    }

    value
        .get("output")?
        .as_array()?
        .iter()
        .flat_map(|item| item.get("content").and_then(Value::as_array).into_iter().flatten())
        .find_map(|content| {
            content
                .get("text")
                .and_then(Value::as_str)
                .or_else(|| content.get("output_text").and_then(Value::as_str))
                .map(ToString::to_string)
        })
}

fn validate_extraction(extraction: &ExtractionResult) -> Result<(), String> {
    let allowed = [
        "prerequisite",
        "contains",
        "related",
        "contrast",
        "application",
        "source",
        "supports",
    ];

    for card in &extraction.cards {
        if card.title.trim().is_empty()
            || card.summary.trim().is_empty()
            || card.content.trim().is_empty()
            || card.r#type.trim().is_empty()
        {
            return Err("OpenAI 返回了字段为空的卡片。".to_string());
        }
    }

    for relation in &extraction.relations {
        if !allowed.contains(&relation.relation_type.as_str()) {
            return Err(format!("OpenAI 返回了非法关系类型：{}", relation.relation_type));
        }
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::test_openai_connection;

    #[test]
    fn connection_test_requires_api_key() {
        let error = test_openai_connection(None, "gpt-5.4-mini").expect_err("missing key should fail");
        assert!(error.contains("未配置 OpenAI API Key"));
    }
}
