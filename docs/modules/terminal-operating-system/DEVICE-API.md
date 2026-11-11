# TOS Device API: interface agreement

This document is the contract between the **PITX Terminal Operating System (TOS)** and the gate hardware
(LPR cameras, RFID readers, boom barriers) and the **gate integration software** that IT or the vendor
writes against the camera/barrier SDK.

The split is simple:

| Side | Owns | Talks to |
| --- | --- | --- |
| **Hardware vendor / IT** | Cameras, barriers, the vendor SDK, and a small **gate controller** program at the gate (PC or edge box) | The SDK on one side, this API on the other |
| **TOS (PITX App)** | The gate rules, trips, vehicle masterfile, staff screens, records | This API |

TOS never talks to the SDK directly, and the gate controller never decides anything on its own while online.
The controller's job is: **camera read → send to TOS → do what TOS says with the barrier.**

```
LPR camera ──SDK──▶ Gate controller ──HTTPS──▶ TOS device endpoint ──▶ gate rules + Trip Scheduling
Boom barrier ◀─SDK── Gate controller ◀──JSON── { "action": "open" | "keep_closed" | "staging" | "wait_for_staff" }
```

---

## 1. Connection

| Item | Value |
| --- | --- |
| Base URL | `https://nuezknlzwfkfxlicrgol.supabase.co/functions/v1/tos-device` |
| Protocol | HTTPS (TLS 1.2+), JSON bodies, UTF-8 |
| Authentication | Header `x-device-key: tos_…` on every call except `/ping` |
| Time | All times ISO 8601 with time zone, e.g. `2026-11-03T06:15:42+08:00` or UTC `…Z` |
| Outbound only | The gate controller calls out to TOS. No inbound ports need to be opened at PITX. |

### Device keys

* Staff create keys in **TOS › Devices & rules › Device keys**. A key is shown **once**; TOS stores only a hash.
* A key can be limited to one gate (e.g. *Entry Gate 1 only*) or allowed for **any gate** (one controller serving several gates).
* Revoking a key stops it immediately (`401`). If a key is lost or leaked: revoke it and create a new one.
* Store the key in the controller's config, not in source code. Do not send it by chat or email.

### Gate and device IDs (current TOS setup)

| Gate ID | Gate | Direction | Device IDs for heartbeats |
| --- | --- | --- | --- |
| `G1` | Entry Gate 1 | entry | `G1-LPR`, `G1-RFID`, `G1-BAR` |
| `G2` | Entry Gate 2 | entry | `G2-LPR`, `G2-BAR` |
| `X1` | Exit Gate | exit | `X1-LPR`, `X1-BAR`, `X1-RFID` |

The current list is also in the `gates` part of `GET /bundle`.

---

## 2. Endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/ping` | Is TOS reachable? No key needed. Returns server time. |
| `POST` | `/read` | One plate read. Returns the decision and what to do with the barrier. |
| `POST` | `/reads` | Up to 100 queued reads (after an outage), oldest first. |
| `GET` | `/event?id=N` | Current state of a read, used while waiting for staff. |
| `POST` | `/heartbeat` | Device status, every 60 seconds. |
| `GET` | `/bundle` | Rules, gates, today's trips and the vehicle masterfile, for offline fallback. |

### 2.1 `POST /read`

Request:

```json
{
  "gate": "G1",
  "plate": "ABC 1234",
  "confidence": 0.97,
  "read_at": "2026-11-03T06:15:42+08:00",
  "read_id": "G1-20261103-061542-0001",
  "test": false
}
```

| Field | Required | Meaning |
| --- | --- | --- |
| `gate` | yes | Gate ID from the table above |
| `plate` | yes | Plate as read. Spaces and dashes are ignored, case does not matter. |
| `confidence` | yes | Camera's read confidence, **0 to 1** (convert from % if the SDK gives 0–100) |
| `read_at` | recommended | When the camera saw the bus. Defaults to the time TOS receives it. Must be within the last 3 days and not in the future. |
| `read_id` | recommended | Unique ID the controller makes for this read. Makes retries safe (see §3). |
| `test` | no | `true` = test read; shown as a test and can be cleared from the Gate monitor. |

Response `200`:

```json
{
  "event_id": 1234,
  "duplicate": false,
  "gate": "G1",
  "plate": "ABC1234",
  "decision": "ALLOW",
  "category": "On time",
  "reason": "On schedule",
  "pending": false,
  "resolution": null,
  "open_barrier": true,
  "action": "open",
  "trip": { "booking_id": "…", "trip_number": "LUC1400", "route": "LUCENA", "etd": "2026-11-03T14:00:00+08:00" },
  "bay": { "id": 12, "name": "Bay 12", "gate": "Gate 2" },
  "display": { "line1": "PROCEED TO BAY 12", "line2": "LUC1400 LUCENA 14:00", "color": "green" },
  "read_at": "2026-11-03T06:15:42+08:00",
  "test": false
}
```

`bay` is the trip's assigned bay from Trip Scheduling (`null` when there is no trip or no bay yet).
`display` is ready-made text for the LED board at the gate (see §2.1a).

**The controller acts on `action` only:**

| `action` | Controller does | When |
| --- | --- | --- |
| `open` | Open the barrier | Booked trip on time, exit gate, or staff let it in |
| `keep_closed` | Keep the barrier closed; show `display` on the gate board if there is one | No trip, expired documents, staff refused, … (per the gate rules) |
| `staging` | Keep closed; direct the bus to staging | Bus is earlier than the early-entry window |
| `wait_for_staff` | Keep closed and poll `GET /event?id=<event_id>` every 2–3 s until `action` changes | Unclear read, unregistered plate, late, substitute bus |

`decision`, `category` and `reason` are for logs and staff screens. Rules can change in TOS without any change at the gate.

#### 2.1a Gate display (driver directions)

If the gate has an LED board or screen, the controller shows `display.line1` and `display.line2` in `display.color`
whenever it gets an answer (from `/read` or from polling `/event`). TOS writes the text, so the controller needs no logic:

| Situation | `line1` | `line2` | `color` |
| --- | --- | --- | --- |
| Booked trip, let in | `PROCEED TO BAY 12` | trip number, destination, ETD | `green` |
| Let in, no bay assigned yet | `PROCEED` | `ASK MARSHAL FOR YOUR BAY` | `green` |
| Too early | `PROCEED TO STAGING` | `ENTRY FROM 13:00` | `amber` |
| Waiting for staff | `PLEASE WAIT` | `STAFF ARE CHECKING` | `amber` |
| Refused | `ENTRY NOT ALLOWED` | `PLEASE SEE TERMINAL OFFICE` | `red` |
| Exit gate | `THANK YOU` | `SAFE TRIP` | `green` |

When staff decide on a waiting bus, the next `/event` poll returns the new text (e.g. `PLEASE WAIT` becomes
`PROCEED TO BAY 12`). Lines are upper case and can be up to about 40 characters (long destination names);
scroll or cut them to fit the board. Keep the text on the board for about 20 seconds or until the next bus is read.

### 2.2 `GET /event?id=1234`

Same response shape as `/read`. While staff are deciding, `pending` is `true` and `action` is `wait_for_staff`.
Once they decide, `action` becomes `open` or `keep_closed`. Stop polling after 10 minutes and keep the barrier closed.

### 2.3 `POST /reads` (batch, after an outage)

```json
{ "reads": [ { "gate": "G1", "plate": "ABC1234", "confidence": 0.96, "read_at": "…", "read_id": "…" }, … ] }
```

Response: `{ "results": [ { "read_id": "…", "status": 200, …same fields as /read… }, … ] }`, in the same order.
A bad item gets its own `status` (`400`/`403`/`422`) without stopping the others. A bad key fails the whole call with `401`.

### 2.4 `POST /heartbeat`

```json
{ "devices": [ { "id": "G1-LPR", "status": "online" }, { "id": "G1-BAR", "status": "fault" } ] }
```

`status` is `online`, `offline` or `fault`. Send every **60 seconds**. TOS shows the status and last heartbeat on
Overview and Devices & rules. Response: `{ "updated": 2, "unknown_or_not_allowed": [], "server_time": "…" }`.

### 2.5 `GET /bundle`

Everything a controller needs to decide on its own if the internet drops:

```json
{
  "generated_at": "…", "date": "2026-11-03", "key_gate": "G1", "bay_window_min": 30,
  "rules": { "early_min": 30, "grace_min": 5, "on_late": "REVIEW", "on_expired": "DENY",
             "on_no_booking": "DENY", "on_unregistered": "REVIEW", "on_substitute": "REVIEW", "min_confidence": 85 },
  "gates": [ { "id": "G1", "name": "Entry Gate 1", "direction": "entry" } ],
  "trips": [ { "trip_number": "LUC1400", "route": "LUCENA", "plate_no": "ABC1234", "etd": "…", "bay": "Bay 5",
               "arrived_at": null, "departed_at": null, "held": false, "denied": false } ],
  "vehicles": [ { "plate_no": "ABC1234", "operator_id": "…", "route": "LUCENA",
                  "cpc_validity": "2027-01-31", "orcr_validity": "2026-12-15" } ]
}
```

Refresh at least **every 5 minutes** and at the start of each day. About 300 KB (most of it the vehicle masterfile).

---

## 3. Reliability rules

1. **Timeouts:** wait at most **3 seconds** for `/read`. If no answer, treat TOS as offline (§4).
2. **Retries are safe** when the same `read_id` is sent again: TOS returns the original answer with `"duplicate": true` and records nothing new. Always set `read_id`.
3. **Clock:** keep the controller clock in sync (NTP). `/ping` returns server time for checking.
4. **One bus, one read:** the controller should debounce, so a bus sitting at the barrier sends one read, not one per frame.
5. **Order:** queued reads go oldest first, so they are judged in the order buses arrived.

## 4. When the internet is down

| Step | Controller does |
| --- | --- |
| Detect | `/read` times out or fails to connect |
| Decide locally | Using the last `/bundle`: plate on a trip today within its bay window → open; registered bus too early → staging; anything else → keep closed and call the gate marshal (or the marshal uses the manual override) |
| Record | Queue every read with its `read_at`, `read_id` and what the controller did |
| Recover | When `/ping` works again, send the queue with `POST /reads` (100 at a time), then fetch a new `/bundle` |

TOS judges the queued reads by `read_at`, so arrival times in reports stay correct.
The barrier must also have a **manual override** at the gate that works with no network at all.

## 5. Errors

| HTTP | `error` | Meaning | Controller does |
| --- | --- | --- | --- |
| 400 | `bad_request` | Missing or wrong fields | Fix the integration; do not retry as is |
| 401 | `unauthorized` | Missing, wrong or revoked key | Stop and alert IT |
| 403 | `wrong_gate` | Key is limited to another gate | Fix the gate ID or the key |
| 404 | `not_found` | Unknown event or route | — |
| 422 | `rejected` | TOS refused the read (unknown gate, bad confidence, `read_at` too old/in future) | Log it; do not retry as is |
| 5xx / timeout | — | TOS or the network is down | Offline mode (§4); retry later with the same `read_id` |

Body: `{ "error": "wrong_gate", "message": "this key is for gate G1, not X1" }`

## 6. Testing without hardware

* Send `"test": true` on reads. They appear on the Gate monitor as tests and are removed with **Clear test reads**.
* `tools/device-simulator.ps1` (in this folder) acts as a gate controller from any Windows PC:

```powershell
.\device-simulator.ps1 -KeyFile key.txt -Action demo -Gate G1
.\device-simulator.ps1 -KeyFile key.txt -Action read -Gate G1 -Plate ABC1234 -Confidence 0.6
.\device-simulator.ps1 -KeyFile key.txt -Action wait -EventId 1234
.\device-simulator.ps1 -KeyFile key.txt -Action offline -Gate G1 -Plate ABC1234,XYZ5678
```

* curl:

```bash
curl -s -X POST "https://nuezknlzwfkfxlicrgol.supabase.co/functions/v1/tos-device/read" -H "x-device-key: $TOS_DEVICE_KEY" -H "content-type: application/json" -d '{"gate":"G1","plate":"ABC1234","confidence":0.97,"read_id":"test-1","test":true}'
```

Acceptance before go-live: each scenario in the demo (booked, unknown, unclear, early, late, exit, staff
decision, offline queue and retry) gives the right barrier action on the real hardware.

## 7. Questions for the vendor

1. Which SDK/API does the camera expose (HTTP push, TCP, ONVIF events, vendor DLL)? Can the camera itself call an HTTPS URL, or do we need a controller PC/edge box?
2. Read confidence: what scale, and what is typical for PH plates in rain/at night?
3. Barrier control: relay/IO from the camera, or a separate controller? Open/close commands and their response time?
4. Does the camera buffer reads when the network is down? How many, with timestamps?
5. Can it debounce one bus into one read? Does it send an image we should keep?
6. Manual override at the barrier: how, and is it logged?
7. Time sync (NTP) and the camera's time zone setting.
8. Who maintains the controller program after go-live, and how are updates delivered?
9. Is there an LED board or screen at each gate for driver directions (§2.1a)? How many characters per line, and how is it driven?

## 8. Change control

This contract is versioned with the PITX-App repository. New optional fields may be added to responses at
any time; controllers must ignore fields they don't know. Removing or renaming a field needs a new
version agreed with IT and the vendor.

| Version | Date | Change |
| --- | --- | --- |
| 1.0 | 2026-11-03 | First version: read, batch reads, event poll, heartbeat, bundle |
| 1.1 | 2026-11-11 | Answers add `bay`, `trip.etd` and `display` (driver directions for the gate board) |
