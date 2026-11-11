<#
  PITX Terminal Operating System: gate device simulator.

  Pretends to be a gate camera / local gate controller and talks to the
  tos-device endpoint exactly as the real integration will (see DEVICE-API.md).
  Use it to check a device key, to show IT and the vendor what the calls look
  like, and to test TOS without hardware. Reads are sent as TEST reads unless
  you pass -Live, so they can be cleared from the Gate monitor.

  The device key comes from Devices & rules > Device keys. Pass it with
  -KeyFile (a text file holding only the key) or the TOS_DEVICE_KEY
  environment variable. Never paste it into scripts you commit.

  Examples
    .\device-simulator.ps1 -KeyFile key.txt -Action ping
    .\device-simulator.ps1 -KeyFile key.txt -Action read -Gate G1 -Plate ABC1234
    .\device-simulator.ps1 -KeyFile key.txt -Action read -Gate G1 -Plate ABC1234 -Confidence 0.6
    .\device-simulator.ps1 -KeyFile key.txt -Action wait -EventId 123
    .\device-simulator.ps1 -KeyFile key.txt -Action offline -Gate G1 -Plate ABC1234,XYZ5678
    .\device-simulator.ps1 -KeyFile key.txt -Action heartbeat -Devices G1-LPR,G1-BAR
    .\device-simulator.ps1 -KeyFile key.txt -Action bundle
    .\device-simulator.ps1 -KeyFile key.txt -Action demo -Gate G1
#>
param(
  [ValidateSet('ping', 'read', 'wait', 'offline', 'heartbeat', 'bundle', 'demo')]
  [string]   $Action = 'demo',
  [string]   $Gate = 'G1',
  [string[]] $Plate,
  [double]   $Confidence = 0.97,
  [long]     $EventId,
  [string[]] $Devices = @('G1-LPR', 'G1-BAR'),
  [string]   $KeyFile,
  [string]   $BaseUrl = 'https://nuezknlzwfkfxlicrgol.supabase.co/functions/v1/tos-device',
  [switch]   $Live
)

$ErrorActionPreference = 'Stop'
$key = if ($KeyFile) { (Get-Content -LiteralPath $KeyFile -Raw).Trim() } else { $env:TOS_DEVICE_KEY }
if (-not $key -and $Action -ne 'ping') { throw 'No device key. Use -KeyFile or set TOS_DEVICE_KEY.' }
$headers = @{ 'x-device-key' = $key }

function Call($method, $path, $body) {
  $req = @{ Method = $method; Uri = "$BaseUrl$path"; Headers = $headers; ContentType = 'application/json' }
  if ($body) { $req.Body = ($body | ConvertTo-Json -Depth 6 -Compress) }
  try {
    Invoke-RestMethod @req
  } catch {
    $resp = $_.Exception.Response
    if ($resp) {
      $text = (New-Object IO.StreamReader($resp.GetResponseStream())).ReadToEnd()
      [pscustomobject]@{ http_status = [int]$resp.StatusCode; answer = $text }
    } else { throw }
  }
}

function NewRead($p, $conf, $at) {
  @{
    gate       = $Gate
    plate      = $p
    confidence = $conf
    read_at    = $at.ToUniversalTime().ToString('o')
    read_id    = "$Gate-" + [guid]::NewGuid().ToString('N').Substring(0, 12)
    test       = -not $Live
  }
}

function Show($r) {
  if ($r.action) {
    '{0,-8} {1,-12} {2,-15} {3}  ({4}{5})' -f $r.decision, $r.plate, $r.action.ToUpper(), $r.reason, "event $($r.event_id)",
      $(if ($r.duplicate) { ', duplicate - already recorded' } else { '' })
    # What the LED board at the gate shows.
    if ($r.display) {
      $fg = @{ green = 'Green'; amber = 'Yellow'; red = 'Red' }[$r.display.color]
      Write-Host ("         [ {0} | {1} ]" -f $r.display.line1, $r.display.line2) -ForegroundColor $(if ($fg) { $fg } else { 'Gray' })
    }
  } else { $r | ConvertTo-Json -Depth 6 }
}

switch ($Action) {
  'ping' { Call GET '/ping' }

  'read' {
    foreach ($p in $Plate) { Show (Call POST '/read' (NewRead $p $Confidence (Get-Date))) }
  }

  'wait' {
    # What the gate controller does after "wait_for_staff": poll until staff decide.
    do {
      $r = Call GET "/event?id=$EventId"
      Show $r
      if ($r.pending) { Start-Sleep -Seconds 3 }
    } while ($r.pending)
  }

  'offline' {
    # Internet down: reads are queued with their own time, then sent together.
    $queue = @()
    $t = (Get-Date).AddMinutes(-3 * $Plate.Count)
    foreach ($p in $Plate) { $queue += NewRead $p $Confidence $t; $t = $t.AddMinutes(3) }
    "Queued $($queue.Count) reads while offline. Sending now..."
    $res = Call POST '/reads' @{ reads = $queue }
    $res.results | ForEach-Object { Show $_ }
    'Sending the same queue again (a retry after a timeout) - every read must come back as a duplicate:'
    (Call POST '/reads' @{ reads = $queue }).results | ForEach-Object { Show $_ }
  }

  'heartbeat' {
    Call POST '/heartbeat' @{ devices = @($Devices | ForEach-Object { @{ id = $_; status = 'online' } }) }
  }

  'bundle' {
    $b = Call GET '/bundle'
    if ($b.http_status) { return $b }
    "Bundle for $($b.date): $($b.trips.Count) trips, $($b.vehicles.Count) vehicles, gates: $(($b.gates | ForEach-Object id) -join ', ')"
    'Rules: early {0} min, grace {1} min, late -> {2}, no booking -> {3}, unregistered -> {4}, min read {5}%' -f
      $b.rules.early_min, $b.rules.grace_min, $b.rules.on_late, $b.rules.on_no_booking, $b.rules.on_unregistered, $b.rules.min_confidence
  }

  'demo' {
    '1. Ping';                Call GET '/ping' | Out-String
    '2. Download the bundle'; $b = Call GET '/bundle'
    if ($b.http_status) { return $b }
    "   $($b.trips.Count) trips today, $($b.vehicles.Count) vehicles in the masterfile"
    $booked = $b.trips | Where-Object { $_.plate_no -and -not $_.arrived_at } | Select-Object -First 1
    $known  = if ($booked) { $booked.plate_no } else { ($b.vehicles | Select-Object -First 1).plate_no }
    $(if ($booked) { "3. Booked bus $known arrives (trip $($booked.trip_number))" } else { '3. A registered bus with no trip today arrives' })
    Show (Call POST '/read' (NewRead $known 0.97 (Get-Date)))
    '4. A bus nobody knows arrives';  Show (Call POST '/read' (NewRead 'SIM0000' 0.95 (Get-Date)))
    '5. A dirty plate (poor read)';   Show (Call POST '/read' (NewRead $known 0.55 (Get-Date)))
    if ($Live) { '6. Heartbeat'; Call POST '/heartbeat' @{ devices = @($Devices | ForEach-Object { @{ id = $_; status = 'online' } }) } | Out-String }
    else { '6. Heartbeat skipped in test mode (it would mark the real devices online). Use -Action heartbeat.' }
    if (-not $Live) { 'Test reads: clear them from the Gate monitor (Clear test reads).' }
  }
}
