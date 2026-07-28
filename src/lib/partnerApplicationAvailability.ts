export type PartnerApplicationAvailability = {
  emailAvailable: boolean;
  phoneAvailable: boolean;
};

export const getPartnerApplicationAvailabilityError = (
  availability: PartnerApplicationAvailability,
) => {
  if (!availability.emailAvailable && !availability.phoneAvailable) {
    return "This email address and phone number are already associated with an account or application.";
  }
  if (!availability.emailAvailable) {
    return "This email address is already associated with an account or application.";
  }
  if (!availability.phoneAvailable) {
    return "This phone number is already associated with an account or application.";
  }
  return "";
};
