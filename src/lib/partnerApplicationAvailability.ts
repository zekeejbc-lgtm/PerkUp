export type PartnerApplicationAvailability = {
  emailAvailable: boolean;
  phoneAvailable: boolean;
};

export const getPartnerApplicationAvailabilityError = (
  availability: PartnerApplicationAvailability,
) => {
  if (!availability.emailAvailable || !availability.phoneAvailable) {
    return "The contact details could not be accepted. Use different verified contact details or contact support.";
  }
  return "";
};
