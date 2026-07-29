export type AssessmentRequestController = {
  begin: () => number;
  cancel: () => void;
  isCurrent: (requestId: number) => boolean;
};

export const createAssessmentRequestController = (): AssessmentRequestController => {
  let currentRequestId = 0;

  return {
    begin: () => {
      currentRequestId += 1;
      return currentRequestId;
    },
    cancel: () => {
      currentRequestId += 1;
    },
    isCurrent: (requestId) => requestId === currentRequestId,
  };
};
