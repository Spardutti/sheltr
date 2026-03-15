#!/bin/bash
# UserPromptSubmit hook that forces explicit skill evaluation

cat > /dev/null

DIR="${CLAUDE_PROJECT_DIR:-.}"

# Build skill list from project skills
SKILL_LIST=""
while IFS= read -r skillfile; do
  name=$(grep -m1 '^name:' "$skillfile" 2>/dev/null | sed 's/^name: *//' | sed 's/^"//' | sed 's/"$//')
  desc=$(grep -m1 '^description:' "$skillfile" 2>/dev/null | sed 's/^description: *//' | sed 's/^"//' | sed 's/"$//')
  if [ -n "$name" ] && [ -n "$desc" ]; then
    SKILL_LIST="${SKILL_LIST}  - ${name}: ${desc}\\n"
  fi
done < <(find "$DIR" -path '*/.claude/skills/*/SKILL.md' 2>/dev/null | sort -u)

INSTRUCTION="INSTRUCTION: MANDATORY SKILL ACTIVATION SEQUENCE\\n\\n"
INSTRUCTION+="<available_skills>\\n"
INSTRUCTION+="System skills (from system-reminder):\\n  - Check system-reminder for built-in skills\\n"

if [ -n "$SKILL_LIST" ]; then
  INSTRUCTION+="Project skills:\\n${SKILL_LIST}"
fi

INSTRUCTION+="</available_skills>\\n\\n"
INSTRUCTION+="Step 1 - EVALUATE (do this in your response):\\n"
INSTRUCTION+="For each skill in <available_skills>, state: [skill-name] - YES/NO - [reason]\\n\\n"
INSTRUCTION+="Step 2 - ACTIVATE (do this immediately after Step 1):\\n"
INSTRUCTION+="IF any skills are YES -> Use Skill(skill-name) tool for EACH relevant skill NOW\\n"
INSTRUCTION+="IF no skills are YES -> State 'No skills needed' and proceed\\n\\n"
INSTRUCTION+="Step 3 - IMPLEMENT:\\n"
INSTRUCTION+="Only after Step 2 is complete, proceed with implementation.\\n\\n"
INSTRUCTION+="CRITICAL: You MUST call Skill() tool in Step 2. Do NOT skip to implementation."

printf '{"additionalContext": "%s"}\n' "$INSTRUCTION"
exit 0
