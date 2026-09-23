# LiteLLM Proxy Starter for Claude Code
# Routes Claude Code -> Groq (Free) / Gemini (Free) / OpenRouter (Free)

$env:Path += ";C:\Users\shobh\AppData\Roaming\Python\Python314\Scripts"

Write-Host "Starting LiteLLM proxy on http://localhost:4000 ..." -ForegroundColor Cyan
Write-Host "Models available:" -ForegroundColor Green
Write-Host "  - claude-3-5-sonnet-20241022  -> Groq Llama-3.3 70B (Free)" -ForegroundColor Yellow
Write-Host "  - claude-3-7-sonnet-20250219  -> Groq Llama-3.3 70B (Free)" -ForegroundColor Yellow
Write-Host "  - gemini-2.0-flash            -> Google Gemini 2.0 Flash (Free)" -ForegroundColor Yellow
Write-Host ""
Write-Host "In another terminal, run:" -ForegroundColor Cyan
Write-Host '  $env:ANTHROPIC_BASE_URL="http://localhost:4000"' -ForegroundColor White
Write-Host '  $env:ANTHROPIC_API_KEY="sk-litellm"' -ForegroundColor White
Write-Host "  claude" -ForegroundColor White
Write-Host ""

litellm --config litellm_config.yaml --port 4000
