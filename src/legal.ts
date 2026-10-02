export const CURRENT_RISK_ACKNOWLEDGEMENT_STATEMENT =
  "I understand that participation in this event may involve inherent risks, including possible injury, illness, property loss or other harm. I confirm that I am responsible for assessing whether participation is suitable for me and agree to follow the organizer's safety instructions. Nothing in this acknowledgement excludes liability that cannot legally be excluded under applicable law.";

export function buildLegalDocumentUrl(
  baseUrl: string,
  locale: string,
  document: 'terms' | 'privacy',
) {
  return `${baseUrl.replace(/\/$/, '')}/${locale}/${document}`;
}
