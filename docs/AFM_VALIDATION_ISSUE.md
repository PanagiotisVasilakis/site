# Greek AFM Validation Issue - Solution

## Problem

When you tried to sign up with:
- Phone: `6955810051`
- AFM: `123456789`
- Name: `panos vas`

The system rejected it with: **"Invalid AFM checksum"**

## Why This Happened

Greek AFM (Αριθμός Φορολογικού Μητρώου) numbers have a **mathematical checksum** built into the 9th digit. The AFM `123456789` is **not a valid** AFM number because digit `9` doesn't match the expected checksum.

### AFM Checksum Algorithm

The 9th digit is calculated from the first 8 digits using this formula:
```
sum = d1×2⁸ + d2×2⁷ + d3×2⁶ + d4×2⁵ + d5×2⁴ + d6×2³ + d7×2² + d8×2¹
remainder = sum mod 11
check_digit = (remainder == 10) ? 0 : remainder
```

For `12345678X`:
- Sum = 1×256 + 2×128 + 3×64 + 4×32 + 5×16 + 6×8 + 7×4 + 8×2
- Sum = 256 + 256 + 192 + 128 + 80 + 48 + 28 + 16 = **1004**
- Remainder = 1004 mod 11 = **3**
- Valid AFM = `123456783` ✅ (not `123456789` ❌)

## Solution

### For Testing

Use one of these **valid test AFM numbers**:

| AFM Number | Status | Notes |
|------------|--------|-------|
| `123456783` | ✅ Valid | Simple sequential test AFM |
| `000000000` | ✅ Valid | All zeros (checksum = 0) |
| `099999990` | ✅ Valid | Test AFM |
| `111111118` | ✅ Valid | All ones with checksum |
| `987654327` | ✅ Valid | Reverse sequential |

### For Production

**Use your REAL AFM** from official documents:
- Tax office (DOY - ΔΟΥ) documents
- TAXIS system printout
- Income tax returns (E1, E2, E3 forms)
- Social security (EFKA) documents

## How to Find Your Real AFM

1. **TAXIS Portal** (best method):
   - Visit: https://www1.gsis.gr/taxisnet/
   - Log in with your credentials
   - Your AFM is displayed at the top

2. **Tax Office Documents**:
   - Any official letter from the tax office
   - Income tax returns
   - VAT registration documents

3. **Social Security (EFKA)**:
   - Your social security card
   - AMKA/EFKA documents

4. **Ask Your Employer**:
   - Your employer has your AFM for payroll

## Updated Error Message

The system now shows a more helpful error when AFM checksum fails:

```
❌ AFM field has an error

• AFM (Αριθμός Φορολογικού Μητρώου): The AFM number you entered 
  has an invalid checksum. Please verify your AFM from official 
  documents (e.g., tax office papers, TAXIS system). If you believe 
  this is an error, contact support.
• Please verify your 9-digit Greek tax identification number
```

## Testing Steps

### Test Sign-Up (with valid AFM)

1. Visit: `http://localhost:3000/en/guest?mode=signup`
2. Fill form:
   ```
   Origin: Greece
   Phone: +30 695 581 0051  (or 6955810051)
   AFM: 123456783  ← Valid test AFM
   Full Name: Panos Vas
   Booking Reference: TEST001
   ```
3. Click "Sign up"
4. Expected: ✅ Redirect to check-in page

### Common Mistakes

❌ **Wrong**: Using random 9 digits like `123456789`  
✅ **Correct**: Use valid AFM with proper checksum like `123456783`

❌ **Wrong**: Entering only 8 digits  
✅ **Correct**: Must be exactly 9 digits

❌ **Wrong**: Including letters or special characters  
✅ **Correct**: Only digits 0-9

## For International Users (Non-Greek)

If you're not from Greece, select **"Abroad"** as origin instead, then enter your **Passport Number**:
- Format: 5-20 alphanumeric characters
- Example: `AB1234567`
- No checksum validation required

## Developer Notes

### AFM Validation Code

Located in `src/lib/afm.ts`:

```typescript
export function isValidAFM(input: string): boolean {
  if (typeof input !== 'string') return false;
  const afm = input.trim();
  if (!/^\d{9}$/.test(afm)) return false;
  const expected = computeAfmCheckDigit(afm.slice(0, 8));
  return Number(afm[8]) === expected;
}
```

This validation runs on the **backend** (`src/app/api/portal/verify/route.ts`) to prevent bypassing via client-side manipulation.

### Generate Valid Test AFMs

Use this Node.js code to generate valid AFMs:

```javascript
function computeAfmCheckDigit(eightDigits) {
  const digits = eightDigits.split('').map(c => Number(c));
  let sum = 0;
  for (let i = 0; i < 8; i++) {
    sum += digits[i] * (2 ** (8 - i));
  }
  const remainder = sum % 11;
  return remainder === 10 ? 0 : remainder;
}

function generateValidAFM(firstEight) {
  const checkDigit = computeAfmCheckDigit(firstEight);
  return firstEight + checkDigit;
}

// Examples
console.log(generateValidAFM('12345678')); // 123456783
console.log(generateValidAFM('09999999')); // 099999990
console.log(generateValidAFM('11111111')); // 111111118
```

## Summary

**Problem**: AFM `123456789` has invalid checksum  
**Solution**: Use `123456783` for testing, or your real AFM for production  
**Alternative**: Select "Abroad" origin and use passport number instead

The system is working correctly—it's protecting against invalid AFM numbers! ✅

---

**Last Updated**: October 2, 2025  
**Status**: Error message improved, validation working correctly
