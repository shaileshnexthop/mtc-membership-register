/** Member contact fields staff may correct (MEM-10), with their English labels. */
export const EDITABLE_FIELDS = {
  email: "Contact email",
  mobilePhone: "Mobile phone",
  homePhone: "Home phone",
  residentialAddress: "Residential address",
  profession: "Profession",
  employerName: "Employer",
} as const;
export type EditableField = keyof typeof EDITABLE_FIELDS;
