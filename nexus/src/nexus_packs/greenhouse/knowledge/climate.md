# Climate

This manual is synthetic. It describes the simulated four-zone greenhouse used by the NEXUS demos.

## Temperature setpoints

Each zone has its own temperature setpoint. The safe operating range for a setpoint is 12 to 32
degrees Celsius; the controller refuses anything outside 5 to 40 degrees Celsius.

Seedlings in zone 1 are kept at 22 degrees Celsius. Tomatoes in zones 2 and 3 grow best between
18 and 26 degrees Celsius. Zone 4 holds herbs and is kept at 20 degrees Celsius.

## Changing a setpoint

Change a setpoint by at most 3 degrees Celsius per hour, so the plants are not shocked. A new
setpoint is verified within 5 seconds of being applied; if it is not, the change is rolled back
to the previous setpoint.

## Frost protection

The main heater protects against frost. When the outside temperature is forecast to fall below
2 degrees Celsius, run a heater boost of 30 minutes before sunset. A heater boost is a high-risk
action: it needs one human approval and can run for 5 to 60 minutes.

Never run the heater with the roof vent more than 10 percent open.
