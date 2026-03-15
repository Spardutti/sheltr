skill_evaluation:
  mandatory: true
  rule: |
    BEFORE writing ANY code, you MUST:
    1. List EVERY skill from the system-reminder's available skills section
    2. For each skill, write: [skill-name] → ACTIVATE / SKIP — [one-line reason]
    3. Call Skill(name) for every skill marked ACTIVATE
    4. Only THEN proceed to implementation
    If you skip this evaluation, your response is INCOMPLETE and WRONG.
