import type {
  CGPARecord,
  GPARecord,
  GradeScale,
  ResultAmendmentRecord,
  ResultPublicationBatch,
  ResultRecord
} from "../../contracts/result-processing.contracts";

export interface ResultProcessingService {
  createGradeScale(input: GradeScale): Promise<GradeScale>;
  updateGradeScale(input: GradeScale): Promise<GradeScale>;
  prepareResultDraft(input: ResultRecord): Promise<ResultRecord>;
  computeResult(input: ResultRecord): Promise<ResultRecord>;
  verifyResult(input: ResultRecord): Promise<ResultRecord>;
  computeTermGpa(input: GPARecord): Promise<GPARecord>;
  computeCumulativeCgpa(input: CGPARecord): Promise<CGPARecord>;
  createPublicationBatch(
    input: ResultPublicationBatch
  ): Promise<ResultPublicationBatch>;
  publishBatch(input: ResultPublicationBatch): Promise<ResultPublicationBatch>;
  requestAmendment(
    input: ResultAmendmentRecord
  ): Promise<ResultAmendmentRecord>;
  approveAmendment(
    input: ResultAmendmentRecord
  ): Promise<ResultAmendmentRecord>;
  applyAmendment(
    input: ResultAmendmentRecord
  ): Promise<ResultAmendmentRecord>;
  propagateRegrade(resultRecordId: string): Promise<ResultRecord>;
}
