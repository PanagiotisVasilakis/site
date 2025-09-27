type PhoneCountry = {
  cc: string; // ISO 3166-1 alpha-2
  name: string;
  dial: string; // E.164 country calling code with +
  flag: string; // Emoji flag
};

const phoneCountries: PhoneCountry[] = [
  // Europe
  { cc: 'GR', name: 'Greece', dial: '+30', flag: '🇬🇷' },
  { cc: 'AL', name: 'Albania', dial: '+355', flag: '🇦🇱' },
  { cc: 'AD', name: 'Andorra', dial: '+376', flag: '🇦🇩' },
  { cc: 'AT', name: 'Austria', dial: '+43', flag: '🇦🇹' },
  { cc: 'BY', name: 'Belarus', dial: '+375', flag: '🇧🇾' },
  { cc: 'BE', name: 'Belgium', dial: '+32', flag: '🇧🇪' },
  { cc: 'BA', name: 'Bosnia & Herzegovina', dial: '+387', flag: '🇧🇦' },
  { cc: 'BG', name: 'Bulgaria', dial: '+359', flag: '🇧🇬' },
  { cc: 'HR', name: 'Croatia', dial: '+385', flag: '🇭🇷' },
  { cc: 'CY', name: 'Cyprus', dial: '+357', flag: '🇨🇾' },
  { cc: 'CZ', name: 'Czechia', dial: '+420', flag: '🇨🇿' },
  { cc: 'DK', name: 'Denmark', dial: '+45', flag: '🇩🇰' },
  { cc: 'EE', name: 'Estonia', dial: '+372', flag: '🇪🇪' },
  { cc: 'FI', name: 'Finland', dial: '+358', flag: '🇫🇮' },
  { cc: 'FR', name: 'France', dial: '+33', flag: '🇫🇷' },
  { cc: 'DE', name: 'Germany', dial: '+49', flag: '🇩🇪' },
  { cc: 'GI', name: 'Gibraltar', dial: '+350', flag: '🇬🇮' },
  { cc: 'HU', name: 'Hungary', dial: '+36', flag: '🇭🇺' },
  { cc: 'IS', name: 'Iceland', dial: '+354', flag: '🇮🇸' },
  { cc: 'IE', name: 'Ireland', dial: '+353', flag: '🇮🇪' },
  { cc: 'IT', name: 'Italy', dial: '+39', flag: '🇮🇹' },
  { cc: 'LV', name: 'Latvia', dial: '+371', flag: '🇱🇻' },
  { cc: 'LI', name: 'Liechtenstein', dial: '+423', flag: '🇱🇮' },
  { cc: 'LT', name: 'Lithuania', dial: '+370', flag: '🇱🇹' },
  { cc: 'LU', name: 'Luxembourg', dial: '+352', flag: '🇱🇺' },
  { cc: 'MT', name: 'Malta', dial: '+356', flag: '🇲🇹' },
  { cc: 'MD', name: 'Moldova', dial: '+373', flag: '🇲🇩' },
  { cc: 'MC', name: 'Monaco', dial: '+377', flag: '🇲🇨' },
  { cc: 'ME', name: 'Montenegro', dial: '+382', flag: '🇲🇪' },
  { cc: 'NL', name: 'Netherlands', dial: '+31', flag: '🇳🇱' },
  { cc: 'MK', name: 'North Macedonia', dial: '+389', flag: '🇲🇰' },
  { cc: 'NO', name: 'Norway', dial: '+47', flag: '🇳🇴' },
  { cc: 'PL', name: 'Poland', dial: '+48', flag: '🇵🇱' },
  { cc: 'PT', name: 'Portugal', dial: '+351', flag: '🇵🇹' },
  { cc: 'RO', name: 'Romania', dial: '+40', flag: '🇷🇴' },
  { cc: 'RU', name: 'Russia', dial: '+7', flag: '🇷🇺' },
  { cc: 'SM', name: 'San Marino', dial: '+378', flag: '🇸🇲' },
  { cc: 'RS', name: 'Serbia', dial: '+381', flag: '🇷🇸' },
  { cc: 'SK', name: 'Slovakia', dial: '+421', flag: '🇸🇰' },
  { cc: 'SI', name: 'Slovenia', dial: '+386', flag: '🇸🇮' },
  { cc: 'ES', name: 'Spain', dial: '+34', flag: '🇪🇸' },
  { cc: 'SE', name: 'Sweden', dial: '+46', flag: '🇸🇪' },
  { cc: 'CH', name: 'Switzerland', dial: '+41', flag: '🇨🇭' },
  { cc: 'TR', name: 'Türkiye', dial: '+90', flag: '🇹🇷' },
  { cc: 'UA', name: 'Ukraine', dial: '+380', flag: '🇺🇦' },
  { cc: 'GB', name: 'United Kingdom', dial: '+44', flag: '🇬🇧' },

  // Americas
  { cc: 'US', name: 'United States', dial: '+1', flag: '🇺🇸' },
  { cc: 'CA', name: 'Canada', dial: '+1', flag: '🇨🇦' },
  { cc: 'MX', name: 'Mexico', dial: '+52', flag: '🇲🇽' },
  { cc: 'AR', name: 'Argentina', dial: '+54', flag: '🇦🇷' },
  { cc: 'BR', name: 'Brazil', dial: '+55', flag: '🇧🇷' },
  { cc: 'CL', name: 'Chile', dial: '+56', flag: '🇨🇱' },
  { cc: 'CO', name: 'Colombia', dial: '+57', flag: '🇨🇴' },
  { cc: 'VE', name: 'Venezuela', dial: '+58', flag: '🇻🇪' },
  { cc: 'PE', name: 'Peru', dial: '+51', flag: '🇵🇪' },
  { cc: 'UY', name: 'Uruguay', dial: '+598', flag: '🇺🇾' },
  { cc: 'PY', name: 'Paraguay', dial: '+595', flag: '🇵🇾' },
  { cc: 'BO', name: 'Bolivia', dial: '+591', flag: '🇧🇴' },
  { cc: 'EC', name: 'Ecuador', dial: '+593', flag: '🇪🇨' },
  { cc: 'CR', name: 'Costa Rica', dial: '+506', flag: '🇨🇷' },
  { cc: 'PA', name: 'Panama', dial: '+507', flag: '🇵🇦' },
  { cc: 'DO', name: 'Dominican Republic', dial: '+1', flag: '🇩🇴' },
  { cc: 'PR', name: 'Puerto Rico', dial: '+1', flag: '🇵🇷' },
  { cc: 'CU', name: 'Cuba', dial: '+53', flag: '🇨🇺' },
  { cc: 'GT', name: 'Guatemala', dial: '+502', flag: '🇬🇹' },
  { cc: 'HN', name: 'Honduras', dial: '+504', flag: '🇭🇳' },
  { cc: 'NI', name: 'Nicaragua', dial: '+505', flag: '🇳🇮' },
  { cc: 'SV', name: 'El Salvador', dial: '+503', flag: '🇸🇻' },
  { cc: 'HT', name: 'Haiti', dial: '+509', flag: '🇭🇹' },
  { cc: 'BZ', name: 'Belize', dial: '+501', flag: '🇧🇿' },
  { cc: 'GY', name: 'Guyana', dial: '+592', flag: '🇬🇾' },
  { cc: 'SR', name: 'Suriname', dial: '+597', flag: '🇸🇷' },

  // Asia
  { cc: 'CN', name: 'China', dial: '+86', flag: '🇨🇳' },
  { cc: 'JP', name: 'Japan', dial: '+81', flag: '🇯🇵' },
  { cc: 'KR', name: 'South Korea', dial: '+82', flag: '🇰🇷' },
  { cc: 'HK', name: 'Hong Kong', dial: '+852', flag: '🇭🇰' },
  { cc: 'MO', name: 'Macau', dial: '+853', flag: '🇲🇴' },
  { cc: 'TW', name: 'Taiwan', dial: '+886', flag: '🇹🇼' },
  { cc: 'SG', name: 'Singapore', dial: '+65', flag: '🇸🇬' },
  { cc: 'MY', name: 'Malaysia', dial: '+60', flag: '🇲🇾' },
  { cc: 'TH', name: 'Thailand', dial: '+66', flag: '🇹🇭' },
  { cc: 'VN', name: 'Vietnam', dial: '+84', flag: '🇻🇳' },
  { cc: 'PH', name: 'Philippines', dial: '+63', flag: '🇵🇭' },
  { cc: 'ID', name: 'Indonesia', dial: '+62', flag: '🇮🇩' },
  { cc: 'IN', name: 'India', dial: '+91', flag: '🇮🇳' },
  { cc: 'PK', name: 'Pakistan', dial: '+92', flag: '🇵🇰' },
  { cc: 'BD', name: 'Bangladesh', dial: '+880', flag: '🇧🇩' },
  { cc: 'LK', name: 'Sri Lanka', dial: '+94', flag: '🇱🇰' },
  { cc: 'NP', name: 'Nepal', dial: '+977', flag: '🇳🇵' },
  { cc: 'KH', name: 'Cambodia', dial: '+855', flag: '🇰🇭' },
  { cc: 'LA', name: 'Laos', dial: '+856', flag: '🇱🇦' },
  { cc: 'MM', name: 'Myanmar', dial: '+95', flag: '🇲🇲' },
  { cc: 'BN', name: 'Brunei', dial: '+673', flag: '🇧🇳' },
  { cc: 'AE', name: 'United Arab Emirates', dial: '+971', flag: '🇦🇪' },
  { cc: 'SA', name: 'Saudi Arabia', dial: '+966', flag: '🇸🇦' },
  { cc: 'QA', name: 'Qatar', dial: '+974', flag: '🇶🇦' },
  { cc: 'BH', name: 'Bahrain', dial: '+973', flag: '🇧🇭' },
  { cc: 'KW', name: 'Kuwait', dial: '+965', flag: '🇰🇼' },
  { cc: 'OM', name: 'Oman', dial: '+968', flag: '🇴🇲' },
  { cc: 'JO', name: 'Jordan', dial: '+962', flag: '🇯🇴' },
  { cc: 'LB', name: 'Lebanon', dial: '+961', flag: '🇱🇧' },
  { cc: 'IL', name: 'Israel', dial: '+972', flag: '🇮🇱' },
  { cc: 'IQ', name: 'Iraq', dial: '+964', flag: '🇮🇶' },
  { cc: 'IR', name: 'Iran', dial: '+98', flag: '🇮🇷' },
  { cc: 'YE', name: 'Yemen', dial: '+967', flag: '🇾🇪' },
  { cc: 'SY', name: 'Syria', dial: '+963', flag: '🇸🇾' },
  { cc: 'AM', name: 'Armenia', dial: '+374', flag: '🇦🇲' },
  { cc: 'AZ', name: 'Azerbaijan', dial: '+994', flag: '🇦🇿' },
  { cc: 'GE', name: 'Georgia', dial: '+995', flag: '🇬🇪' },
  { cc: 'KZ', name: 'Kazakhstan', dial: '+7', flag: '🇰🇿' },
  { cc: 'KG', name: 'Kyrgyzstan', dial: '+996', flag: '🇰🇬' },
  { cc: 'TJ', name: 'Tajikistan', dial: '+992', flag: '🇹🇯' },
  { cc: 'TM', name: 'Turkmenistan', dial: '+993', flag: '🇹🇲' },
  { cc: 'UZ', name: 'Uzbekistan', dial: '+998', flag: '🇺🇿' },

  // Oceania
  { cc: 'AU', name: 'Australia', dial: '+61', flag: '🇦🇺' },
  { cc: 'NZ', name: 'New Zealand', dial: '+64', flag: '🇳🇿' },
  { cc: 'FJ', name: 'Fiji', dial: '+679', flag: '🇫🇯' },
  { cc: 'PG', name: 'Papua New Guinea', dial: '+675', flag: '🇵🇬' },

  // Africa
  { cc: 'DZ', name: 'Algeria', dial: '+213', flag: '🇩🇿' },
  { cc: 'AO', name: 'Angola', dial: '+244', flag: '🇦🇴' },
  { cc: 'BJ', name: 'Benin', dial: '+229', flag: '🇧🇯' },
  { cc: 'BW', name: 'Botswana', dial: '+267', flag: '🇧🇼' },
  { cc: 'BF', name: 'Burkina Faso', dial: '+226', flag: '🇧🇫' },
  { cc: 'BI', name: 'Burundi', dial: '+257', flag: '🇧🇮' },
  { cc: 'CM', name: 'Cameroon', dial: '+237', flag: '🇨🇲' },
  { cc: 'CV', name: 'Cape Verde', dial: '+238', flag: '🇨🇻' },
  { cc: 'CF', name: 'Central African Republic', dial: '+236', flag: '🇨🇫' },
  { cc: 'TD', name: 'Chad', dial: '+235', flag: '🇹🇩' },
  { cc: 'KM', name: 'Comoros', dial: '+269', flag: '🇰🇲' },
  { cc: 'CG', name: 'Congo', dial: '+242', flag: '🇨🇬' },
  { cc: 'CD', name: 'Congo (DRC)', dial: '+243', flag: '🇨🇩' },
  { cc: 'CI', name: 'Côte d’Ivoire', dial: '+225', flag: '🇨🇮' },
  { cc: 'DJ', name: 'Djibouti', dial: '+253', flag: '🇩🇯' },
  { cc: 'EG', name: 'Egypt', dial: '+20', flag: '🇪🇬' },
  { cc: 'ER', name: 'Eritrea', dial: '+291', flag: '🇪🇷' },
  { cc: 'ET', name: 'Ethiopia', dial: '+251', flag: '🇪🇹' },
  { cc: 'GA', name: 'Gabon', dial: '+241', flag: '🇬🇦' },
  { cc: 'GM', name: 'Gambia', dial: '+220', flag: '🇬🇲' },
  { cc: 'GH', name: 'Ghana', dial: '+233', flag: '🇬🇭' },
  { cc: 'GN', name: 'Guinea', dial: '+224', flag: '🇬🇳' },
  { cc: 'GW', name: 'Guinea-Bissau', dial: '+245', flag: '🇬🇼' },
  { cc: 'KE', name: 'Kenya', dial: '+254', flag: '🇰🇪' },
  { cc: 'LS', name: 'Lesotho', dial: '+266', flag: '🇱🇸' },
  { cc: 'LR', name: 'Liberia', dial: '+231', flag: '🇱🇷' },
  { cc: 'LY', name: 'Libya', dial: '+218', flag: '🇱🇾' },
  { cc: 'MG', name: 'Madagascar', dial: '+261', flag: '🇲🇬' },
  { cc: 'MW', name: 'Malawi', dial: '+265', flag: '🇲🇼' },
  { cc: 'ML', name: 'Mali', dial: '+223', flag: '🇲🇱' },
  { cc: 'MR', name: 'Mauritania', dial: '+222', flag: '🇲🇷' },
  { cc: 'MU', name: 'Mauritius', dial: '+230', flag: '🇲🇺' },
  { cc: 'MA', name: 'Morocco', dial: '+212', flag: '🇲🇦' },
  { cc: 'MZ', name: 'Mozambique', dial: '+258', flag: '🇲🇿' },
  { cc: 'NA', name: 'Namibia', dial: '+264', flag: '🇳🇦' },
  { cc: 'NE', name: 'Niger', dial: '+227', flag: '🇳🇪' },
  { cc: 'NG', name: 'Nigeria', dial: '+234', flag: '🇳🇬' },
  { cc: 'RW', name: 'Rwanda', dial: '+250', flag: '🇷🇼' },
  { cc: 'SN', name: 'Senegal', dial: '+221', flag: '🇸🇳' },
  { cc: 'SC', name: 'Seychelles', dial: '+248', flag: '🇸🇨' },
  { cc: 'SL', name: 'Sierra Leone', dial: '+232', flag: '🇸🇱' },
  { cc: 'SO', name: 'Somalia', dial: '+252', flag: '🇸🇴' },
  { cc: 'ZA', name: 'South Africa', dial: '+27', flag: '🇿🇦' },
  { cc: 'SS', name: 'South Sudan', dial: '+211', flag: '🇸🇸' },
  { cc: 'SD', name: 'Sudan', dial: '+249', flag: '🇸🇩' },
  { cc: 'TZ', name: 'Tanzania', dial: '+255', flag: '🇹🇿' },
  { cc: 'TG', name: 'Togo', dial: '+228', flag: '🇹🇬' },
  { cc: 'TN', name: 'Tunisia', dial: '+216', flag: '🇹🇳' },
  { cc: 'UG', name: 'Uganda', dial: '+256', flag: '🇺🇬' },
  { cc: 'ZM', name: 'Zambia', dial: '+260', flag: '🇿🇲' },
  { cc: 'ZW', name: 'Zimbabwe', dial: '+263', flag: '🇿🇼' },
];

export const DEFAULT_ABROAD_DIAL = '+1';

// European Union ISO-2 members (as of 2025)
const EU_CC: string[] = [
  'AT','BE','BG','HR','CY','CZ','DK','EE','FI','FR','DE','GR','HU','IE','IT','LV','LT','LU','MT','NL','PL','PT','RO','SK','SI','ES','SE'
];

// Pinned top markets (put first), then EU countries
const POPULAR_CC: string[] = [
  'GR', // local market
  'GB','DE','FR','IT','NL','ES','SE','AT', // key EU markets
  'US', // international
];

function sortPhoneCountries(list: PhoneCountry[] = phoneCountries): PhoneCountry[] {
  return [...list].sort((a, b) => a.name.localeCompare(b.name));
}

function prioritizeCountries(
  pinnedCC: string[] = [...POPULAR_CC, ...EU_CC],
  list: PhoneCountry[] = phoneCountries
): PhoneCountry[] {
  const map = new Map<string, PhoneCountry>();
  for (const c of list) map.set(c.cc, c);
  const out: PhoneCountry[] = [];
  // Add pinned in the given order (if present)
  for (const cc of pinnedCC) {
    const item = map.get(cc);
    if (item && !out.find(x => x.cc === cc)) out.push(item);
  }
  // Append the rest alphabetically
  const rest = sortPhoneCountries(list.filter(c => !out.find(x => x.cc === c.cc)));
  out.push(...rest);
  return out;
}

export const phoneCountriesPrioritized = prioritizeCountries();
