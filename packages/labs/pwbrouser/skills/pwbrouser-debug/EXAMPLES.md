# Debugging Examples

## Scenario: Page loads but is blank

```bash
pwbrouser navigate https://myapp.example.com/dashboard
pwbrouser snapshot          # check if any elements rendered
pwbrouser console error     # check for JS errors preventing render
pwbrouser network /api/     # check if API calls succeeded
pwbrouser screenshot ./before.png
```

Interpretation:

- Empty snapshot + console errors → JS crashed, fix the error
- Empty snapshot + no console errors → check network for failed API that silently breaks rendering
- Snapshot shows elements but visually blank → CSS issue, use screenshot

## Scenario: Form submission fails silently

```bash
pwbrouser navigate https://myapp.example.com/login
pwbrouser fill textbox "Email" "user@example.com"
pwbrouser fill textbox "Password" "wrongpass"
pwbrouser click button "Log In"
pwbrouser snapshot          # still on login page? check for error message
pwbrouser console error     # validation errors in console?
pwbrouser network /login    # check POST response status
pwbrouser network_req 3     # inspect request/response bodies
```

Interpretation:

- Still on login page + network shows 401 → wrong credentials
- Still on login page + network shows 422 → validation error, check response body
- Redirected to dashboard but then error → JS error after navigation, check console

## Scenario: API returns unexpected data

```bash
pwbrouser navigate https://myapp.example.com/users
pwbrouser network /api/users
# Output shows request at index 5 with status 200 but something looks off
pwbrouser network_req 5 response    # get full response body
pwbrouser network_req 5 request     # verify the request payload
```

## Scenario: Mobile layout is broken

```bash
pwbrouser resize 375 812            # iPhone viewport
pwbrouser navigate https://myapp.example.com
pwbrouser wait_for text "Menu"
pwbrouser screenshot ./mobile.png
pwbrouser snapshot                  # check which elements are visible
```

## Scenario: Dialog (alert/confirm) blocks the page

```bash
pwbrouser navigate https://myapp.example.com
pwbrouser click button "Delete"
# Page is blocked by confirm dialog
pwbrouser snapshot                  # snapshot still shows the dialog trigger
pwbrouser dialog accept             # or dismiss to cancel
pwbrouser snapshot                  # verify result
```

## Scenario: Multi-step wizard debugging

```bash
pwbrouser navigate https://myapp.example.com/wizard

# Step 1
pwbrouser fill textbox "Name" "John"
pwbrouser click button "Next"
pwbrouser wait_for text "Step 2"
pwbrouser snapshot

# Step 2
pwbrouser select combobox "Country" "Spain"
pwbrouser click button "Next"
pwbrouser wait_for text "Step 3"

# Step 3 - verify final state
pwbrouser snapshot
pwbrouser network /submit
pwbrouser console error
```

## Scenario: Debugging with snapshot refs (complex UI)

```bash
pwbrouser navigate https://myapp.example.com/complex-form
pwbrouser snapshot
# Output: - textbox "Email" [ref=e4]
#         - textbox "Password" [ref=e5]
#         - button "Submit" [ref=e6]

# Interact using refs (precise, no ambiguity)
pwbrouser --json '{"method":"browser_fill_form","params":{"fields":[{"target":{"ref":"e4"},"value":"a@b.com"},{"target":{"ref":"e5"},"value":"pass"}]}}'
pwbrouser --json '{"method":"browser_click","params":{"target":{"ref":"e6"}}}'
pwbrouser snapshot
```
