These TwinSpires payloads are **synthetic**: hand-written to the response
shapes the adapter expects, because the build sandbox could not reach
twinspires.com. Replace them with real captures from `edge ts-probe`
(saved under `v2/var/captures/<date>/`) and keep the tests passing.
