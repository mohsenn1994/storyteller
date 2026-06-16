# Match Events Data Contract

The `match_events.json` file contains information about a Celtic FC football match against Kilmarnock. The match events contain the following fields:

| Field         | Type    | Required | Notes |
|---------------|---------|----------|-------|
| `minute`      | integer | yes      | minute in match (0–120) |
| `period`      | integer | yes      | 1 or 2 for 1st/2nd half   |
| `second`      | integer | yes      | second in minute (0-59) |
| `teamRef1`    | string  | yes      | team name or code |
| `type`        | string  | yes      | e.g., `start`, `start delay`, `substitution`, `yellow card`, `post`, `penalty won`, `penalty lost`, `penalty goal`, `offside`, `miss`, `lineup`, `goal`, `free kick won`, `free kick lost`, `end delay`, `end 2`, `end 1`, `end 14`, `corner`, `attempt saved`, `attempt blocked`, `added time` |
| `playerRef1`  | string  | yes      | player name |
| `playerRef2`  | string  | no       | player 2 ID |
| `comment`     | string  | yes      | human description |

Player names can be retrieved from the `kilmarnock-squad.json` and `celtic-squad.json` files if required.