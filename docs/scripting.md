# ApiDeDoo Script Support

ApiDeDoo supports lightweight request scripting inspired by Postman.

## Scope

Each request can store two scripts:

- Pre-request script: runs before sending HTTP request
- Post-response script: runs after response is received

Scripts run on the backend in an isolated VM with a small execution timeout.

## Available API

### Variables

- `pm.variables.get(name)`
- `pm.variables.set(name, value)`
- `pm.variables.unset(name)`
- `pm.variables.all()`

Variables map to workspace-level variables in the database.

### Request context

- `pm.request.method`
- `pm.request.url`
- `pm.request.headers`
- `pm.request.bodyPreview`

### Response context (post-response script only)

- `pm.response.status`
- `pm.response.statusText`
- `pm.response.headers`
- `pm.response.bodyRaw`
- `pm.response.bodyJson`

## Examples

### Set auth token before request

```js
pm.variables.set("authToken", "abc123");
```

### Capture status code after response

```js
pm.variables.set("lastStatus", String(pm.response?.status ?? 0));
```

### Save an ID from JSON response

```js
if (pm.response?.bodyJson && typeof pm.response.bodyJson === "object") {
  const userId = pm.response.bodyJson.id;
  if (userId) {
    pm.variables.set("userId", String(userId));
  }
}
```

## Notes

- Keep scripts short and deterministic.
- Long-running or network calls inside scripts are not supported.
- Script logs are shown in the Response panel under Script Logs.
