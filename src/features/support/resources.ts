/** Published APCOSYS destinations, cross-checked against the existing marketing repository. */
export const supportEmail = 'info@apcosys.net';
export const legalDocuments = [
  { id:'terms',title:'Terms & Conditions',description:'Access to the service, payments and responsibilities.',icon:'file',url:'https://apcosys.net/legal/terms' },
  { id:'privacy',title:'Privacy Policy',description:'Personal information, how it is used and your choices.',icon:'shield',url:'https://apcosys.net/legal/privacy-policy' },
  { id:'api-license',title:'API & Data License Agreement',description:'Terms for API access and use of APCOSYS data.',icon:'code',url:'https://apcosys.net/legal/api-data-license-agreement' },
  { id:'processing',title:'Data Processing Agreement',description:'Processing and protection of personal data.',icon:'lock',url:'https://apcosys.net/legal/data-processing-agreement' },
  { id:'collection',title:'Data Collection Policy',description:'The information collected and the purpose of observations.',icon:'database',url:'https://apcosys.net/legal/data-collection-policy' },
  { id:'cookies',title:'Cookie Policy',description:'Cookies, related technologies and available preferences.',icon:'settings',url:'https://apcosys.net/legal/cookie-policy' },
] as const;

export const supportTopics = ['Search & data','Private scanning','API & integrations','Account & access','Billing & payments','Organization','Other'] as const;
export interface SupportDraft { name: string; email: string; topic: string; message: string }
export function prepareSupportMessage(draft: SupportDraft) {
  const subject = `APCOSYS · ${draft.topic}`;
  const body = [`Name: ${draft.name.trim()}`,`Reply email: ${draft.email.trim()}`,`Topic: ${draft.topic}`,'',draft.message.trim()].join('\n');
  const mailto = `mailto:${supportEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  return { subject,body,mailto };
}
