#!/usr/bin/env python3
"""
USAGE: python3 src/regen_attempts.py

Regenerates src/data/skillAttempts.json with four buckets per student/skill:
fail, partial (attempted, some parts right, room to improve), pass, and
unattempted (absent from the record). Deterministic (hash-based) so re-runs
are reproducible. Reads the already-built src/data/skills.json — doesn't
touch the standards/subjects/skills hierarchy itself.
"""
import json
import hashlib

def hash_fraction(s):
    h = hashlib.md5(s.encode("utf-8")).hexdigest()
    return int(h[:8], 16) / 0xFFFFFFFF

students = json.load(open("src/data/students.json"))
skills = json.load(open("src/data/skills.json"))

skill_attempts = {}
for student in students:
    record = {}
    for sk in skills:
        f = hash_fraction(student["id"] + sk["id"])
        if f < 0.16:
            record[sk["id"]] = "fail"
        elif f < 0.34:
            record[sk["id"]] = "partial"
        elif f < 0.82:
            record[sk["id"]] = "pass"
        # else: left unattempted (absent from record)
    skill_attempts[student["id"]] = record

with open("src/data/skillAttempts.json", "w") as f:
    json.dump(skill_attempts, f, indent=2)

for student in students:
    record = skill_attempts[student["id"]]
    counts = {"fail": 0, "partial": 0, "pass": 0}
    for status in record.values():
        counts[status] += 1
    unattempted = len(skills) - len(record)
    print(f"{student['name']}: fail={counts['fail']} partial={counts['partial']} pass={counts['pass']} unattempted={unattempted}")

print(f"\nDONE. Regenerated skillAttempts.json for {len(students)} students across {len(skills)} skills.")
