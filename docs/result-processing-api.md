# Result Processing API

Result Processing APIs are exposed under `/api/v1` and require `AuthGuard`, `PolicyGuard`, and an active department context.

## Endpoints

| Method | Path | Policy | Description |
| --- | --- | --- | --- |
| POST | `/grade-scales` | `result-processing.grade-scale.manage` | Create a grade scale and optional grade rules. |
| GET | `/grade-scales` | `result-processing.grade-scale.read` | List grade scales. |
| GET | `/grade-scales/:id` | `result-processing.grade-scale.read` | Get one grade scale. |
| PATCH | `/grade-scales/:id` | `result-processing.grade-scale.manage` | Update a grade scale and optionally replace rules. |
| POST | `/results/compute` | `result-processing.result.compute` | Compute draft result records from grading records. |
| GET | `/results` | `result-processing.result.read` | List result records. Students only see their own records. |
| GET | `/results/:id` | `result-processing.result.read` | Get one result record. |
| POST | `/results/:id/verify` | `result-processing.result.verify` | Verify a computed result. |
| POST | `/results/:id/publish` | `result-processing.result.publish` | Publish and lock a verified result. |
| POST | `/gpa/compute-term` | `result-processing.gpa.compute` | Compute term GPA from published results. |
| GET | `/gpa` | `result-processing.gpa.read` | List GPA records. |
| GET | `/cgpa` | `result-processing.gpa.read` | List or compute-and-read CGPA records. |
| POST | `/result-publications` | `result-processing.publication.manage` | Create a result publication batch record. |
| GET | `/result-publications` | `result-processing.publication.manage` | List publication batches. |
| GET | `/result-publications/:id` | `result-processing.publication.manage` | Get one publication batch. |
| POST | `/result-amendments` | `result-processing.amendment.request` | Request an amendment for a published or locked result. |
| GET | `/result-amendments` | `result-processing.amendment.request` | List amendment records. |
| POST | `/result-amendments/:id/approve` | `result-processing.amendment.approve` | Approve a requested amendment. |
| POST | `/result-amendments/:id/apply` | `result-processing.amendment.apply` | Apply an approved amendment. |

## Security Constraints

- Every repository query and update is scoped by `departmentId`.
- Cross-department access is rejected by guards and repeated in service/repository checks.
- Teachers can compute draft results only for course offerings where they have an active teacher assignment.
- Teachers cannot verify, publish, approve amendments, apply amendments, or manage grade scales.
- Department admin or exam-office authority is required for verification, publication, GPA computation, grade scale management, publication management, amendment approval, and amendment application.
- Computation only writes `DRAFT` or `COMPUTED` result records. `VERIFIED`, `PUBLISHED`, `LOCKED`, and `AMENDED` records are not directly overwritten.
- Published or locked corrections must use the append-only amendment request, approval, and apply flow.
- Sensitive actions write audit log entries.
- Safe `updateMany` plus `findFirst` transaction patterns are used for status transitions and guarded updates.

## Computation MVP

- Result computation reads existing `GradingRecord` rows for an offering.
- Components are derived from assignment submissions and quiz attempts where linked.
- Component scores are normalized against assignment or quiz max points and weighted evenly for MVP.
- Percentages are mapped through active `GradeRule` rows from the selected or default grade scale.
- Result records store normalized percentage, letter grade, grade point, credit snapshot, quality points, and computation snapshot JSON.
- GPA is computed from published result records for an academic term.
- CGPA is computed from cumulative GPA records.

Transcript, notification, frontend, and full publication workflow side effects are intentionally out of scope.

