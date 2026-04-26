import type {
  CGPARecord,
  GPARecord,
  GradeRule,
  GradeScale,
  ResultAmendmentRecord,
  ResultComponent,
  ResultPublicationBatch,
  ResultRecord
} from "../../contracts/result-processing.contracts";

export interface ResultProcessingRepositoryPort {
  findGradeScaleById(id: string): Promise<GradeScale | null>;
  findGradeScaleByCode(departmentId: string, code: string): Promise<GradeScale | null>;
  saveGradeScale(record: GradeScale): Promise<GradeScale>;
  saveGradeRule(record: GradeRule): Promise<GradeRule>;
  findResultRecordById(id: string): Promise<ResultRecord | null>;
  findResultRecordByEnrollment(
    enrollmentId: string,
    courseOfferingId: string
  ): Promise<ResultRecord | null>;
  saveResultRecord(record: ResultRecord): Promise<ResultRecord>;
  replaceResultComponents(
    resultRecordId: string,
    components: ResultComponent[]
  ): Promise<ResultComponent[]>;
  saveResultPublicationBatch(
    record: ResultPublicationBatch
  ): Promise<ResultPublicationBatch>;
  saveGpaRecord(record: GPARecord): Promise<GPARecord>;
  saveCgpaRecord(record: CGPARecord): Promise<CGPARecord>;
  saveResultAmendmentRecord(
    record: ResultAmendmentRecord
  ): Promise<ResultAmendmentRecord>;
}
