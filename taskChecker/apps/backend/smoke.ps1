# TeamFlow full-route smoke suite — exercises every endpoint group against a
# running backend (default http://127.0.0.1:4002). Exits non-zero on failure.
param([string]$Base = "http://127.0.0.1:4002")

$script:pass = 0
$script:fail = 0
$script:failed = @()

function Req($method, $path, $body = $null, $headers = @{}, $inFile = $null) {
  $url = "$Base$path"
  $args = @("-s", "-m", "20", "-w", "`n%{http_code}", "-X", $method, $url)
  foreach ($k in $headers.Keys) { $args += @("-H", "${k}: $($headers[$k])") }
  if ($body -ne $null) { $args += @("-H", "Content-Type: application/json", "-d", $body) }
  if ($inFile -ne $null) { $args += @("--data-binary", "@$inFile") }
  $out = & curl.exe @args 2>$null
  $code = [int]$out[-1]
  $text = ($out[0..($out.Count - 2)] -join "`n")
  $json = $null
  try { $json = $text | ConvertFrom-Json } catch {}
  return @{ code = $code; text = $text; json = $json }
}

function Check($name, [bool]$ok, $detail = "") {
  if ($ok) { $script:pass++; Write-Output "PASS $name" }
  else { $script:fail++; $script:failed += $name; Write-Output "FAIL $name :: $detail" }
}

function AuthH($token) { return @{ Authorization = "Bearer $token" } }

$tag = [guid]::NewGuid().ToString("N").Substring(0, 8)
$V1 = "/v1"

# ---------- health ----------
$r = Req "GET" "/livez"; Check "livez" ($r.code -eq 200 -and $r.json.ok -eq $true) $r.text
$r = Req "GET" "/readyz"; Check "readyz" ($r.code -eq 200 -and $r.json.ok -eq $true) $r.text

# ---------- auth ----------
$signupBody = "{`"email`":`"smoke-$tag@example.com`",`"password`":`"password12345`",`"name`":`"Smoke Owner`",`"orgName`":`"Smoke Org $tag`"}"
$r = Req "POST" "$V1/auth/signup" $signupBody
Check "signup" ($r.code -eq 201 -and $r.json.tokens.accessToken) $r.text
$tok = $r.json.tokens.accessToken; $refresh = $r.json.tokens.refreshToken
$orgId = $r.json.org.id; $ownerId = $r.json.user.id

$r = Req "POST" "$V1/auth/login" "{`"email`":`"smoke-$tag@example.com`",`"password`":`"password12345`"}"
Check "login" ($r.code -eq 200 -and $r.json.tenant.tenant_id -eq $orgId) $r.text

$r = Req "POST" "$V1/auth/refresh" "{`"refreshToken`":`"$refresh`"}"
Check "refresh" ($r.code -eq 200 -and $r.json.accessToken) $r.text

$r = Req "GET" "$V1/me" $null (AuthH $tok)
Check "me" ($r.code -eq 200 -and $r.json.user.id -eq $ownerId) $r.text

# ---------- orgs ----------
$r = Req "POST" "$V1/orgs" "{`"name`":`"Second Org $tag`"}" (AuthH $tok)
Check "orgs.create" ($r.code -eq 201 -and $r.json.org.id) $r.text
$org2 = $r.json.org.id

$r = Req "POST" "$V1/auth/switch-org" "{`"orgId`":`"$org2`"}" (AuthH $tok)
Check "switch-org" ($r.code -eq 200 -and $r.json.tenant.tenant_id -eq $org2) $r.text
$tok2 = $r.json.accessToken
$r = Req "POST" "$V1/auth/switch-org" "{`"orgId`":`"$orgId`"}" (AuthH $tok)
Check "switch-org-back" ($r.code -eq 200) $r.text

$r = Req "GET" "$V1/orgs/$orgId" $null (AuthH $tok)
Check "orgs.get" ($r.code -eq 200 -and $r.json.org.id -eq $orgId) $r.text

# ---------- invites ----------
$r = Req "POST" "$V1/orgs/$orgId/invites" "{`"email`":`"member-$tag@example.com`",`"role`":`"member`"}" (AuthH $tok)
Check "invites.create" ($r.code -eq 201 -and $r.json.invitationUrl) $r.text
$invToken = ($r.json.invitationUrl -split "token=")[1]

$r = Req "GET" "$V1/invites/$invToken/preview"
Check "invites.preview" ($r.code -eq 200 -and $r.json.invite.email -eq "member-$tag@example.com") $r.text

$r = Req "POST" "$V1/invites/$invToken" "{`"name`":`"Smoke Member`",`"password`":`"password12345`"}"
Check "invites.accept" ($r.code -eq 200 -and $r.json.tenantId -eq $orgId) $r.text

$r = Req "POST" "$V1/auth/login" "{`"email`":`"member-$tag@example.com`",`"password`":`"password12345`"}"
Check "member-login" ($r.code -eq 200) $r.text
$memberTok = $r.json.tokens.accessToken; $memberId = $r.json.user.id

# ---------- members ----------
$r = Req "GET" "$V1/orgs/$orgId/members" $null (AuthH $tok)
Check "members.list" ($r.code -eq 200 -and ($r.json.members.Count -ge 2)) $r.text

$r = Req "PATCH" "$V1/orgs/$orgId/members/$memberId" "{`"role`":`"admin`"}" (AuthH $tok)
Check "members.patch-role" ($r.code -eq 200 -and $r.json.role -eq "admin") $r.text

$r = Req "DELETE" "$V1/orgs/$orgId/members/$memberId" $null (AuthH $tok)
Check "members.deactivate" ($r.code -eq 200 -and $r.json.ok -eq $true) $r.text

# ---------- teams ----------
$r = Req "POST" "$V1/teams" "{`"name`":`"Smoke Team`"}" (AuthH $tok)
Check "teams.create" ($r.code -eq 201 -and $r.json.team.id) $r.text
$teamId = $r.json.team.id

$r = Req "GET" "$V1/orgs/$orgId/teams" $null (AuthH $tok)
Check "teams.list" ($r.code -eq 200 -and ($r.json.teams.Count -ge 1)) $r.text

$r = Req "PATCH" "$V1/teams/$teamId" "{`"name`":`"Smoke Team 2`"}" (AuthH $tok)
Check "teams.patch" ($r.code -eq 200 -and $r.json.team.name -eq "Smoke Team 2") $r.text

# ---------- projects ----------
$r = Req "POST" "$V1/projects" "{`"teamId`":`"$teamId`",`"name`":`"Smoke Board`",`"key`":`"SMK`"}" (AuthH $tok)
Check "projects.create" ($r.code -eq 201 -and $r.json.project.id) $r.text
$projId = $r.json.project.id

$r = Req "GET" "$V1/orgs/$orgId/projects" $null (AuthH $tok)
Check "projects.list" ($r.code -eq 200 -and ($r.json.projects.Count -ge 1)) $r.text

$r = Req "PATCH" "$V1/projects/$projId" "{`"name`":`"Smoke Board Renamed`"}" (AuthH $tok)
Check "projects.patch" ($r.code -eq 200 -and $r.json.ok -eq $true) $r.text

$r = Req "PUT" "$V1/projects/$projId/lists" "{`"status`":`"backlog`",`"label`":`"Ideas`"}" (AuthH $tok)
Check "projects.rename-list" ($r.code -eq 200 -and $r.json.list.label -eq "Ideas") $r.text

$r = Req "GET" "$V1/projects/$projId/lists" $null (AuthH $tok)
Check "projects.lists" ($r.code -eq 200 -and ($r.json.lists.Count -ge 1)) $r.text

# ---------- tasks ----------
$taskBody = "{`"projectId`":`"$projId`",`"title`":`"Smoke task $tag`",`"description`":`"desc here`",`"priority`":`"high`",`"dueAt`":`"2026-12-31T12:00:00.000Z`"}"
$idem = "smoke-$tag-1"
$taskId = $null
$r = Req "POST" "$V1/tasks" $taskBody (@{ Authorization = "Bearer $tok"; "Idempotency-Key" = $idem })
Check "tasks.create" ($r.code -eq 201 -and $r.json.task.id -and $r.json.idempotentReplay -eq $false) $r.text
$taskId = $r.json.task.id

$r = Req "POST" "$V1/tasks" $taskBody (@{ Authorization = "Bearer $tok"; "Idempotency-Key" = $idem })
Check "tasks.idempotent-replay" ($r.code -eq 200 -and $r.json.idempotentReplay -eq $true -and $r.json.task.id -eq $taskId) $r.text

$r = Req "GET" "$V1/orgs/$orgId/projects/$projId/tasks?limit=10" $null (AuthH $tok)
Check "tasks.list" ($r.code -eq 200 -and ($r.json.data.Count -ge 1)) $r.text

$r = Req "GET" "$V1/tasks/$taskId" $null (AuthH $tok)
Check "tasks.get" ($r.code -eq 200 -and $r.json.task.id -eq $taskId) $r.text

$r = Req "PATCH" "$V1/tasks/$taskId" "{`"status`":`"in_progress`",`"title`":`"Smoke task $tag v2`"}" (AuthH $tok)
Check "tasks.patch" ($r.code -eq 200 -and $r.json.action -eq "status_changed") $r.text

# ---------- comments ----------
$r = Req "POST" "$V1/tasks/$taskId/comments" "{`"body`":`"smoke comment`"}" (AuthH $tok)
Check "comments.create" ($r.code -eq 201 -and $r.json.comment.id) $r.text
$commentId = $r.json.comment.id

$r = Req "GET" "$V1/tasks/$taskId/comments?limit=10" $null (AuthH $tok)
Check "comments.list" ($r.code -eq 200 -and ($r.json.data.Count -ge 1)) $r.text

$r = Req "DELETE" "$V1/comments/$commentId" $null (AuthH $tok)
Check "comments.delete" ($r.code -eq 200 -and $r.json.ok -eq $true) $r.text

# ---------- chat ----------
$r = Req "POST" "$V1/chat/messages" "{`"body`":`"hello @Smoke Member`"}" (AuthH $tok)
Check "chat.send" ($r.code -eq 201 -and $r.json.message.id) $r.text
$chatId = $r.json.message.id

$r = Req "GET" "$V1/chat/messages?limit=10" $null (AuthH $tok)
Check "chat.list" ($r.code -eq 200 -and ($r.json.data.Count -ge 1)) $r.text

$r = Req "DELETE" "$V1/chat/messages/$chatId" $null (AuthH $tok)
Check "chat.delete" ($r.code -eq 200 -and $r.json.ok -eq $true) $r.text

# ---------- activity / notifications ----------
$r = Req "GET" "$V1/activity?limit=10" $null (AuthH $tok)
Check "activity.list" ($r.code -eq 200 -and ($r.json.data.Count -ge 1)) $r.text

Start-Sleep -Seconds 4  # let the worker fan out notifications
$r = Req "GET" "$V1/notifications?limit=10" $null (AuthH $tok)
$notifDetail = if ($r.text) { $r.text.Substring(0, [Math]::Min(300, $r.text.Length)) } else { "" }
Check "notifications.list" ($r.code -eq 200 -and ($r.json.data.Count -ge 1)) $notifDetail
$notifId = $null
if ($r.json.data.Count -ge 1) {
  $notifId = $r.json.data[0].id
  $r2 = Req "POST" "$V1/notifications/$notifId/read" $null (AuthH $tok)
  Check "notifications.read" ($r2.code -eq 200 -and $r2.json.ok -eq $true) $r2.text
} else {
  Check "notifications.read" $false "no notifications fanned out"
}

# ---------- search ----------
$r = Req "GET" "$V1/search?q=smoke+task&type=all&limit=10" $null (AuthH $tok)
Check "search" ($r.code -eq 200 -and ($r.json.results.Count -ge 1)) $r.text

# ---------- webhooks ----------
$r = Req "POST" "$V1/webhooks" "{`"name`":`"smoke hook`",`"url`":`"http://127.0.0.1:9/nope`",`"events`":[`"task.created`"]}" (AuthH $tok)
Check "webhooks.create" ($r.code -eq 201 -and $r.json.secret) $r.text
$hookId = $r.json.webhook.id

$r = Req "GET" "$V1/webhooks" $null (AuthH $tok)
Check "webhooks.list" ($r.code -eq 200 -and ($r.json.webhooks.Count -ge 1)) $r.text

$r = Req "POST" "$V1/webhooks/$hookId/rotate-secret" $null (AuthH $tok)
Check "webhooks.rotate" ($r.code -eq 200 -and $r.json.secret) $r.text

$r = Req "GET" "$V1/webhooks/$hookId/deliveries?limit=10" $null (AuthH $tok)
Check "webhooks.deliveries" ($r.code -eq 200 -and $r.json.deliveries) $r.text

# trigger a delivery attempt (fails fast: connection refused on :9)
$null = Req "POST" "$V1/tasks" "{`"projectId`":`"$projId`",`"title`":`"hook trigger $tag`"}" (AuthH $tok)
Start-Sleep -Seconds 8
$r = Req "GET" "$V1/webhooks/$hookId/deliveries?limit=10" $null (AuthH $tok)
Check "webhooks.delivery-ledger" ($r.code -eq 200 -and ($r.json.deliveries.Count -ge 1)) $r.text

# ---------- api keys ----------
$r = Req "POST" "$V1/api-keys" "{`"name`":`"smoke key`",`"scopes`":[`"read`",`"write`"]}" (AuthH $tok)
Check "apikeys.create" ($r.code -eq 201 -and $r.json.key) $r.text
$apiKey = $r.json.key; $apiKeyId = $r.json.apiKey.id

$r = Req "GET" "$V1/api-keys" $null (AuthH $tok)
Check "apikeys.list" ($r.code -eq 200 -and ($r.json.apiKeys.Count -ge 1)) $r.text

$r = Req "GET" "$V1/orgs/$orgId/projects" $null @{ "X-TeamFlow-Key" = $apiKey }
Check "apikeys.auth" ($r.code -eq 200 -and ($r.json.projects.Count -ge 1)) $r.text

$r = Req "POST" "$V1/teams" "{`"name`":`"should-fail`"}" @{ "X-TeamFlow-Key" = $apiKey }
Check "apikeys.write-ok" ($r.code -eq 201) $r.text

$r = Req "DELETE" "$V1/api-keys/$apiKeyId" $null (AuthH $tok)
Check "apikeys.revoke" ($r.code -eq 200 -and $r.json.ok -eq $true) $r.text

# ---------- audit ----------
$r = Req "GET" "$V1/audit-logs?limit=10" $null (AuthH $tok)
Check "audit.list" ($r.code -eq 200 -and ($r.json.logs.Count -ge 1)) $r.text

# ---------- billing ----------
$r = Req "GET" "$V1/billing/plans" $null (AuthH $tok)
Check "billing.plans" ($r.code -eq 200 -and ($r.json.plans.Count -eq 3)) $r.text

$r = Req "POST" "$V1/billing/subscribe" "{`"plan`":`"pro`"}" (AuthH $tok)
Check "billing.subscribe" ($r.code -eq 200 -and $r.json.plan -eq "pro") $r.text

# ---------- attachments (memory backend) ----------
$r = Req "POST" "$V1/attachments/presign" "{`"fileName`":`"smoke.txt`",`"contentType`":`"text/plain`",`"size`":`12,`"taskId`":`"$taskId`"}" (AuthH $tok)
Check "attachments.presign" ($r.code -eq 201 -and $r.json.attachmentId -and $r.json.upload.url) $r.text
$attId = $r.json.attachmentId; $objKey = $r.json.objectKey

$tmp = Join-Path $env:TEMP "smoke-upload.txt"
"hello smoke!" | Set-Content -NoNewline -Path $tmp
$up = & curl.exe -s -m 20 -w "`n%{http_code}" -X PUT "$Base$V1/attachments/upload/$attId" -H "Authorization: Bearer $tok" -H "Content-Type: text/plain" -H "X-Object-Key: $objKey" --data-binary "@$tmp" 2>$null
$upCode = [int]$up[-1]
Check "attachments.upload" ($upCode -eq 200) ($up -join "`n")
$dl = & curl.exe -s -m 20 -w "`n%{http_code}" "$Base$V1/attachments/$attId/download" -H "Authorization: Bearer $tok" 2>$null
$dlCode = [int]$dl[-1]; $dlBody = ($dl[0..($dl.Count - 2)] -join "`n")
Check "attachments.download" ($dlCode -eq 200 -and $dlBody -eq "hello smoke!") "code=$dlCode body=$dlBody"

# ---------- tasks delete / projects delete / teams delete ----------
$r = Req "DELETE" "$V1/tasks/$taskId" $null (AuthH $tok)
Check "tasks.delete" ($r.code -eq 200 -and $r.json.ok -eq $true) $r.text

$r = Req "DELETE" "$V1/projects/$projId" $null (AuthH $tok)
Check "projects.delete" ($r.code -eq 200 -and $r.json.ok -eq $true) $r.text

$r = Req "DELETE" "$V1/teams/$teamId" $null (AuthH $tok)
Check "teams.delete" ($r.code -eq 200) $r.text

# ---------- logout / refresh-revoked ----------
$r = Req "POST" "$V1/auth/logout" "{`"refreshToken`":`"$refresh`"}" 
Check "logout" ($r.code -eq 200 -and $r.json.ok -eq $true) $r.text

Write-Output ""
Write-Output "RESULT: $($script:pass) passed, $($script:fail) failed"
if ($script:fail -gt 0) { Write-Output "FAILED: $($script:failed -join ', ')"; exit 1 }
