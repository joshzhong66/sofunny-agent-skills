# Codex / OpenCode Automation Rules

When interacting with this repository via Codex or OpenCode IDE extensions:

1. **Intended Usage**: This module is a skill for parsing gigabytes of PostgreSQL logs for NewAPI bills. Do not write custom extraction lines; execute `python newapi_audit_skill.py --dir <path>` instead.
2. **Terminal UX**: The module heavily relies on standard I/O (prompting the user 3 times for IDs and Date Ranges).
3. **Billing Definition**: 
   - `total_usd` = `total_quota` / 500000.0
   - `type == 2` in the log defines an API consumption. DO NOT count type=1 or others.
4. **Formatting**: Always maintain the ASCII tables outputted by the script. Do not reformat them into disjoint text.