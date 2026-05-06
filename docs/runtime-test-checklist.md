# Lexora LMS Runtime Test Checklist

## Test Environment

- Environment: Local Ubuntu VM
- Server IP: 192.168.197.130
- API via Nginx: http://192.168.197.130/api/v1
- Direct API Port: 4000 bound to 127.0.0.1 only
- Process Manager: PM2
- Reverse Proxy: Nginx
- Database: PostgreSQL

## 1. Deployment / Runtime Checks

- [x] PM2 process `lexora-api` online
- [x] API health works from VM through direct localhost port
- [x] API health works from VM through Nginx
- [x] API health works from Windows host through Nginx
- [x] Direct `192.168.197.130:4000` access blocked from Windows host
- [ ] PM2 survives reboot
- [ ] Nginx survives reboot
- [ ] PostgreSQL survives reboot

## 2. Auth Checks

- [ ] Register student user
- [ ] Login user
- [ ] Receive access token
- [ ] Receive refresh token/session
- [ ] Refresh token works
- [ ] Logout works
- [ ] Invalid password rejected
- [ ] Repeated failed login attempt tracked

## 3. Authorization / Department Isolation

- [ ] Protected endpoint rejects unauthenticated request
- [ ] Authenticated user can access own allowed resources
- [ ] Student cannot access another student’s data
- [ ] Teacher cannot access unassigned course data
- [ ] Admin cannot access another department’s data
- [ ] Policy guard works on sensitive endpoints

## 4. Academic Core

- [ ] Create academic program
- [ ] List academic programs
- [ ] Create course
- [ ] List courses
- [ ] Create course offering
- [ ] Assign teacher to course offering
- [ ] Enroll student
- [ ] Validate student course visibility rules

## 5. Assessment

- [ ] Create assignment
- [ ] List assignments
- [ ] Submit assignment
- [ ] Student can only see own submissions
- [ ] Teacher can review assigned course submissions
- [ ] Create quiz
- [ ] Start quiz attempt
- [ ] Submit quiz attempt
- [ ] Validate quiz access rules

## 6. Result Processing

- [ ] Create/configure grade scale
- [ ] Compute result
- [ ] Verify result
- [ ] Publish result
- [ ] Published result becomes locked
- [ ] Direct edit after publish blocked
- [ ] Amendment request created
- [ ] Amendment approved
- [ ] Amendment applied
- [ ] GPA computed
- [ ] CGPA computed

## 7. Transcript Verification

- [ ] Create transcript record
- [ ] Issue transcript version
- [ ] Generate verification token
- [ ] Public verification works
- [ ] Public verification returns safe/minimal data
- [ ] Token expiry respected
- [ ] Revoke transcript/token
- [ ] Revoked transcript fails or shows revoked status

## 8. API Quality Checks

- [ ] Pagination works on list endpoints
- [ ] Invalid DTO rejected with validation error
- [ ] Rate limit works on public transcript verification endpoint
- [ ] Error responses include request ID
- [ ] Sensitive endpoints do not expose excessive data

## 9. Notes / Issues Found

| Date | Module | Issue | Status | Fix Commit |
|---|---|---|---|---|
| 2026-05-06 | Deployment | Direct API port 4000 exposed to LAN | Fixed | 46a4eaf |

## 10. Final Runtime Verdict

- [ ] Existing backend modules runtime-tested
- [ ] Critical bugs documented
- [ ] Fixes committed
- [ ] Ready to start Class Session Module