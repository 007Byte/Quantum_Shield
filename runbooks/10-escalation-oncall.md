# Escalation & On-Call Procedures Runbook

**Severity:** All (SEV1-SEV4)
**Last Updated:** 2026-03-09
**Component:** Incident Management, On-Call Coordination
**Owner:** Platform Engineering & Operations

---

## Overview

This runbook defines the incident severity levels, on-call structure, escalation procedures, communication protocols, and post-incident processes. This is the master runbook for coordinating responses across all other runbooks.

---

## Severity Definitions & SLAs

### SEV1: Critical - Immediate Action Required

**Definition:** Production system down or severely degraded, impacting customers or critical operations.

**Characteristics:**
- No workaround available
- Affects multiple customers or core functionality
- Revenue impact or data loss risk
- Complete service outage

**Examples:**
- Database completely down
- Authentication system down
- API responding with 5xx errors to >50% of requests
- Security breach detected (keys compromised)
- Encryption system corrupted
- All API servers down

**Response SLA:**
- Acknowledgment: 5 minutes
- Investigation start: 10 minutes
- Status update: Every 15 minutes

**Resolution Target (RTO):**
- 30 minutes for investigation
- 60 minutes total to resolution or escalation to management

**Escalation Steps:**
1. Page on-call engineer immediately
2. If not acknowledged in 5 mins → page backup engineer
3. If not resolved in 30 mins → escalate to engineering manager
4. If not resolved in 60 mins → escalate to VP Engineering

---

### SEV2: High - Urgent Response Required

**Definition:** Significant service degradation or functionality impaired, affecting some users.

**Characteristics:**
- Partial outage or severe degradation
- Affects subset of customers/features
- Workaround may exist
- Service performance severely impacted

**Examples:**
- High latency (p95 >5 seconds)
- API error rate 5-50%
- One service down but others operational
- Authentication rate-limited but not completely down
- Disk usage critical (>90%)

**Response SLA:**
- Acknowledgment: 10 minutes
- Investigation start: 15 minutes
- Status update: Every 30 minutes

**Resolution Target (RTO):**
- 60 minutes for investigation
- 2 hours total to resolution or escalation

**Escalation Steps:**
1. Page on-call engineer
2. If not acknowledged in 10 mins → page backup engineer
3. If not resolved in 60 mins → escalate to engineering manager
4. If not resolved in 2 hours → escalate to VP Engineering

---

### SEV3: Medium - Urgent But Not Critical

**Definition:** Service degradation or issues that don't impact core functionality.

**Characteristics:**
- Non-critical feature affected
- Affects small number of users
- Workaround available
- Can be scheduled for next business day

**Examples:**
- Secondary feature failing (reporting, analytics)
- Single customer affected
- Non-critical background job failing
- Certificate expiring in 7 days
- Disk space warning (but not critical)

**Response SLA:**
- Acknowledgment: 1 hour
- Investigation start: 2 hours
- Status update: Daily

**Resolution Target (RTO):**
- Within 24 hours or next business day

**Escalation Steps:**
1. Create ticket in incident tracking
2. Assign to on-call engineer (no page)
3. If not started in 2 hours → send Slack reminder
4. If not resolved in 24 hours → escalate to manager

---

### SEV4: Low - Minor Issue

**Definition:** Cosmetic issues, minor bugs, or operational tasks.

**Characteristics:**
- No customer impact
- Can wait for next sprint
- Documentation or process improvements
- General operational tasks

**Examples:**
- Minor UI bug
- Documentation outdated
- Process improvement suggestion
- Monitoring dashboard needs update

**Response SLA:**
- No SLA, backlog item

**Escalation Steps:**
1. Create ticket for next sprint planning

---

## On-Call Structure

### On-Call Rotation

**Primary On-Call:** 1 engineer (1 week)
- Receives all SEV1/SEV2 pages
- Primary responder for all incidents
- Must respond to pages within 15 minutes

**Backup On-Call:** 1 engineer (rotates weekly)
- Called if primary doesn't acknowledge
- Coverage for primary when unavailable
- Attends optional sync calls

**Weekend/Holiday Coverage:** Weekend rotation
- Reduced availability expected
- Remote-first, flexible location
- Response time may be longer (up to 30 mins)

### On-Call Schedules

**Weekly Rotation (Monday-Friday, 9am-6pm EST):**
- Week of Jan 8: Alice Johnson
- Week of Jan 15: Bob Chen
- Week of Jan 22: Carol Williams
- Week of Jan 29: David Martinez

**Backup Rotation:**
- Rotates opposite day from primary
- Can be on-call for multiple primaries

**Weekend/Holiday (24/7):**
- Saturday-Sunday full rotation
- Holidays: Special rotation (posted on wiki)
- On-call engineer gets comp time next week

### Contact Information

```
On-Call Rotation: https://internal.qav.com/oncall

SLACK CHANNELS:
#incidents - All incident communications
#incident-sev1 - SEV1 incidents only
#platform-eng - Team channel

PAGERDUTY:
- Service: QAV Production
- Policy: SEV1 pages primary, SEV2 pages all
- Escalation: 30 min to manager, 60 min to VP

PHONE (for SEV1):
- Primary on-call: Listed in PagerDuty
- Escalation line: +1-555-0100

EMAIL:
- Incident notifications: incidents@qav.com
- Escalation: escalation@qav.com
```

---

## Incident Response Process

### Step 1: Detection & Alerting

**Automated Detection:**
- Prometheus alerts → PagerDuty
- CloudWatch alarms → PagerDuty
- Uptime monitors → PagerDuty
- Manual report from customer → Slack → PagerDuty

**Alert Routing:**
```
SEV1 Alert
  ↓
PagerDuty pages on-call engineer (SMS + call)
  ↓
Incident created in PagerDuty
  ↓
Slack notification #incident-sev1
  ↓
Incident Commander assigned
```

### Step 2: Initial Response (0-15 minutes)

1. **On-Call Engineer acknowledges page**
   - Respond via PagerDuty app or SMS
   - Takes 5-10 minutes to read context
   - Joins Slack #incidents channel

2. **Create incident ticket**
   ```bash
   # Automatically created by PagerDuty
   # Contains:
   # - Alert name and timestamp
   # - Service affected
   # - Relevant metrics
   # - Links to dashboards
   ```

3. **Assess severity & impact**
   - Check if severity was correctly assigned
   - Verify actual vs. false alarm
   - Determine scope of impact

4. **Join war room (if SEV1)**
   ```
   SEV1: Immediate Zoom war room
   SEV2: Optional Zoom or Slack thread
   SEV3: Slack thread only
   ```

### Step 3: Incident Coordination (15-60 minutes)

5. **Incident Commander takes charge**
   ```
   Role: Incident Commander (or escalation manager)
   Responsibilities:
   - Coordinate response team
   - Drive communication
   - Make escalation decisions
   - Track timeline and actions
   - Post status updates
   ```

6. **Activate response team**
   ```
   SEV1 typical response team:
   - Incident Commander
   - Primary on-call engineer
   - Backup on-call engineer
   - Relevant subject matter experts (DBA, etc.)
   - Customer success (for notifications)

   Signal: "@channel SEV1 incident: [SERVICE] - [BRIEF DESC]"
   ```

7. **Run incident war room** (if SEV1)
   ```
   Zoom meeting: See PagerDuty incident details
   Duration: Until incident resolved or handed off

   Agenda:
   1. Context: What failed, when, scope (2 min)
   2. Status: Current investigation findings (5 min)
   3. Action: What are we doing right now (5 min)
   4. Check-in: Every 15 minutes until resolved

   Recording: Automatically recorded for post-mortem
   Transcript: Saved to incident ticket
   ```

8. **Follow runbook procedures**
   - Reference specific runbook (e.g., 01-database-recovery.md)
   - Execute steps in order
   - Skip non-applicable paths
   - Document all actions taken
   - Note any deviations from runbook

### Step 4: Ongoing Management (during incident)

9. **Provide status updates**
   ```
   Frequency:
   - SEV1: Every 15 minutes
   - SEV2: Every 30 minutes
   - SEV3: Every 2 hours

   Template:
   ```
   [HH:MM] Status Update #2
   Status: INVESTIGATING

   Summary: Database connection pool exhausted, identified slow query

   Current Actions:
   - Optimizing slow query index (DBA)
   - Increasing pool size temporarily (SRE)
   - Monitoring improvement (Oncall)

   ETA: 15 minutes for initial mitigation
   ```
   ```

10. **Update customer-facing status**
    ```
    Status Page: statuspage.io

    SEV1/High SEV2:
    - Immediately post incident page
    - Initial: "Investigating issue"
    - 15-min updates: Status of work
    - Final: "Monitoring" → "Resolved"

    Customer Notification:
    - Email for major customers
    - For extended incidents
    - Template in CRM system
    ```

11. **Escalate if not progressing**
    ```
    No progress in 20 minutes → Escalate to manager
    No progress in 45 minutes → Escalate to VP Engineering
    No progress in 90 minutes → Customer communication

    Escalation contact:
    - Page backup engineer if needed
    - Get subject matter expert involved
    - Bring in architect if systemic
    ```

### Step 5: Resolution & Handoff

12. **Mark incident resolved**
    ```
    When:
    - Service fully operational
    - All customers restored
    - Monitoring confirms stability (5+ min)

    Actions:
    - Update PagerDuty incident: "Resolved"
    - Post final status update
    - Schedule post-mortem
    - Save runbook deviations for review
    ```

13. **Post-incident activities**
    ```
    Timeline:
    - T+30 min: Initial write-up (while fresh)
    - T+24 hour: Post-mortem scheduled
    - T+3 days: Post-mortem meeting
    - T+7 days: Action items assigned
    - T+30 days: Action items complete
    ```

---

## Communication Templates

### Initial Status (when incident detected)

```
🚨 INCIDENT ALERT 🚨

Service: [SERVICE_NAME]
Severity: [SEV1/SEV2/SEV3]
Time: [START_TIME] UTC
Duration: [DURATION] minutes

Status: INVESTIGATING

What we know:
- [WHAT IS BROKEN]
- [SCOPE: how many customers/endpoints affected]
- [SUSPECTED CAUSE if known]

What we're doing:
- [ACTION 1]
- [ACTION 2]
- [ACTION 3]

ETA: [ESTIMATED_TIME_TO_RESOLUTION]

Updates: Every 15 minutes in #incidents

🔗 War Room: [ZOOM_LINK]
📊 Dashboard: [GRAFANA_LINK]
```

### Ongoing Status Update

```
📋 Status Update #[N]

Time Elapsed: [DURATION]

Summary: [1 sentence current state]

Progress:
✅ [COMPLETED ACTION]
🔄 [IN PROGRESS ACTION]
⏳ [PENDING ACTION]

Metrics:
- Error Rate: 45% → 5% (improving)
- Latency P95: 8s → 2s (improving)
- Affected Users: 500 → 50

Next Steps:
- [ACTION 1] (5 min)
- [ACTION 2] (10 min)

ETA: [TIME] - Monitoring to verify
```

### Resolution Status

```
✅ INCIDENT RESOLVED ✅

Service: [SERVICE_NAME]
Total Duration: [DURATION]
Resolution Time: [TIME]

Timeline:
- [TIME]: Incident detected
- [TIME]: Root cause identified
- [TIME]: Fix deployed
- [TIME]: Verified stable

Root Cause:
[BRIEF DESCRIPTION OF WHAT HAPPENED]

Impact:
- Users affected: [NUMBER]
- Duration: [DURATION]
- Data loss: None / [DESCRIPTION]

Actions:
- Follow-up meeting: [TIME]
- Runbook review: [LINK]
- Preventive measures: [PLANNED]

Thank you for your patience.
```

### Customer Notification Email

```
Subject: Quantum_Shield Service Incident - Update & Resolution

Dear Valued Customer,

On [DATE] at [TIME] UTC, we experienced an outage affecting [SERVICE].

WHAT HAPPENED:
We identified [BRIEF TECHNICAL EXPLANATION] in our [COMPONENT].

IMPACT:
- Duration: [START] to [END] ([DURATION] minutes)
- Affected: [X] customers / [PERCENTAGE]%
- Data loss: None

RESOLUTION:
We [DESCRIPTION OF FIX]. Service was fully restored at [TIME].

WHAT WE'RE DOING:
To prevent recurrence, we will [PREVENTIVE MEASURES].

We sincerely apologize for the disruption. If you have any questions,
please contact support@qav.com or reply to this email.

Best regards,
Quantum_Shield Operations Team
```

---

## Escalation Decision Tree

```
Incident Triggered
    |
    ├─ Acknowledged by on-call? (within 5 min)
    │   ├─ NO → Page backup engineer → Escalate to manager
    │   └─ YES → Continue investigation
    |
    ├─ Root cause identified? (within 20 min for SEV1)
    │   ├─ NO → Escalate to SME (DBA, Architect, etc.)
    │   └─ YES → Begin remediation
    |
    ├─ Progress toward resolution? (every 15 min for SEV1)
    │   ├─ NO → Escalate to manager / VP Engineering
    │   │   └─ Manager may increase team size or try different approach
    │   └─ YES → Continue current actions
    |
    ├─ Service recovered? (within SLA)
    │   ├─ YES → Post-incident activities
    │   └─ NO → Continue escalation
    |
    └─ Customer communication needs?
        ├─ >15 min for SEV1 → Initial notification
        ├─ >1 hour for SEV2 → Notification sent
        └─ Every 30 min update if >1 hour total
```

---

## Post-Incident Process

### Timeline

**Day 0 (Incident Day):**
- T+15 min: Initial write-up started
- T+2 hours: Detailed timeline drafted
- T+4 hours: Runbook review and feedback collected
- T+8 hours: Action items assigned

**Day 1:**
- 9am: Post-mortem scheduled (typically within 24 hours)
- Meeting notes shared
- Blameless review conducted

**Days 2-7:**
- Action items in progress
- Fixes validated in staging
- Preventive measures implemented

**Day 30:**
- Retrospective: Did fixes hold?
- Action items completed
- Runbook updated

### Post-Mortem Meeting Format

**Duration:** 60 minutes

**Attendees:**
- Incident commander
- On-call engineer (responder)
- Subject matter experts
- Manager (if SEV1)
- Learning objective: What can we improve?

**Agenda:**
```
1. Timeline of events (10 min)
   - What happened, when
   - Key decision points
   - How was it resolved

2. Root cause analysis (20 min)
   - Why did this happen?
   - Contributing factors
   - NOT: Who did it wrong (blameless)

3. Action items (20 min)
   - What can we do to prevent?
   - Quick wins vs. long-term fixes
   - Owner and deadline for each

4. Process improvements (10 min)
   - Was runbook helpful?
   - Communication gaps?
   - Team training needs?
```

**Output:**
- Incident summary document
- Action items ticket
- Runbook updates
- Shared learning (post to wiki)

### Blameless Postmortem Principles

- **Focus on systems, not individuals**
  - Not: "Alice failed to check the logs"
  - Yes: "We lacked automated log alerting"

- **Assume good intentions**
  - Everyone was trying to do the right thing
  - Conditions made it difficult

- **Address root causes**
  - Not just the immediate trigger
  - But the conditions that allowed it

- **Action items must be specific**
  - Not: "Improve monitoring"
  - Yes: "Add alert for replication lag >30s with threshold of 5s"

---

## Essential Contact Information

### Immediate Escalation Contacts

```
PRIMARY ON-CALL (This Week):
- Name: [Check PagerDuty]
- Phone: [Check PagerDuty]
- Slack: @oncall-primary

BACKUP ON-CALL:
- Name: [Check PagerDuty]
- Phone: [Check PagerDuty]
- Slack: @oncall-backup

MANAGER (Platform Engineering):
- Name: [Engineering Manager]
- Phone: +1-555-0101
- Slack: @platform-manager

VP ENGINEERING:
- Name: [VP Engineering]
- Phone: +1-555-0102 (SEV1 only)
- Slack: @vp-engineering
```

### Support Escalation

```
CUSTOMER SUCCESS LEAD:
- Slack: #customer-alerts
- Email: customer-success@qav.com

MARKETING/COMMS:
- For public announcements
- Email: marketing@qav.com

LEGAL/COMPLIANCE:
- For data breach incidents
- Email: legal@qav.com
```

### Technical Escalation

```
DATABASE DBA:
- Slack: @dba-oncall
- Email: dba@qav.com

SECURITY ENGINEER:
- For security incidents
- Slack: @security-oncall
- Email: security@qav.com

INFRASTRUCTURE LEAD:
- For infrastructure issues
- Slack: @infra-lead
- Email: infrastructure@qav.com
```

---

## Quick Reference Checklists

### For On-Call Engineer Receiving Page

```
☐ Open PagerDuty incident details
☐ Read alert context and runbook
☐ Join #incidents Slack channel
☐ If SEV1: Join Zoom war room
☐ Message: "Acknowledged, investigating"
☐ Follow relevant runbook procedures
☐ Provide updates every 15 min (SEV1)
☐ Keep incident ticket updated
☐ Escalate if stuck for >20 min
```

### For Incident Commander

```
☐ Create incident ticket
☐ Identify on-call engineer
☐ Assemble response team if needed
☐ Start Zoom recording (SEV1)
☐ Post initial status update
☐ Establish 15-min check-in cadence
☐ Coordinate customer communications
☐ Drive toward resolution
☐ Schedule post-mortem
☐ Create follow-up action items
```

### For Manager (if escalated)

```
☐ Review incident details
☐ Assess if additional resources needed
☐ Decide: Same approach or pivot?
☐ Communicate escalation to VP if continuing
☐ Offer support/pairing with on-call
☐ Plan post-incident improvements
☐ Support post-mortem process
☐ Track action item completion
```

---

## References

- **Incident Severity Policy:** See Section 1 (this document)
- **Runbooks:** See numbered runbooks (01-09)
- **PagerDuty Setup:** https://internal.qav.com/pagerduty
- **Status Page:** https://status.qav.com
- **Post-Mortem Template:** https://internal.qav.com/templates/postmortem
- **On-Call Rotation:** https://internal.qav.com/oncall

---

## Last Review Date

2026-03-09

**Next Review:** Quarterly or after major incident

**Maintained By:** Platform Engineering Team

---

**Document Version:** 1.0 | Last Updated: 2026-03-09
