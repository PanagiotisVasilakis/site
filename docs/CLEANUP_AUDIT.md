# 🧹 Code Cleanup Audit Report

**Date**: October 17, 2025  
**Status**: Comprehensive cleanup recommended

---

## 📋 Files to Delete (Legacy/Unused)

### 1. SQLite Legacy Files (Already Excluded from Build)
These files reference the old SQLite database that was replaced by Prisma + PostgreSQL:

```bash
# Scripts - SQLite migration tools
scripts/init-db.ts          # 270 lines - Creates SQLite tables
scripts/migrate.ts          # 60 lines - SQLite migration runner
scripts/test-db.ts          # Unknown size - SQLite test utilities

# Libraries - Old database layer
src/lib/database.ts         # Not found (likely already deleted)
src/lib/repositories.ts     # Not found (likely already deleted)
src/lib/cacheManager.ts     # References './database'
src/lib/monitor.ts          # References './database'

# Types
src/types/sqljs.d.ts        # 22 lines - SQL.js TypeScript definitions
```

**Action**: Safe to delete - Already excluded from tsconfig.json

---

### 2. Old Guest Data Store (Replaced by Prisma)
```bash
src/lib/guestDataStore-old.ts    # 450+ lines - Legacy JSON file-based storage
```

**Status**: Should be deleted or archived  
**Reason**: 
- Replaced by Prisma repositories
- Uses old database.ts (SQLite)
- Current code uses `src/lib/guestDataStore.ts` (Prisma-based)

---

### 3. Deprecated Auth Shim
```bash
src/lib/auth.ts    # Backwards compatibility layer
```

**Content**:
```typescript
/**
 * @deprecated This file is kept for backwards compatibility.
 * Please import from '@/lib/auth' (the auth/ directory) instead.
 */
export * from '@/lib/auth/admin';
export * from '@/lib/auth/common';
```

**Action**: Can be deleted if all imports updated to use `@/lib/auth/*` directly

---

### 4. Legacy Route Shim
```bash
src/app/[locale]/house/page.tsx    # Re-exports /apartment page
```

**Content**:
```typescript
// Legacy route shim: keep old /house URL working temporarily.
export { default, dynamic } from '@/app/[locale]/apartment/page';
```

**Action**: 
- Keep if external links still use `/house`
- Delete once external references updated
- Add note with deprecation timeline

---

## 🔍 Code Smells & Refactoring Opportunities

### 1. Logger Import Inconsistency

**Issue**: Two logger modules exist:
- `src/lib/logger.ts` - Old/simple logger
- `src/lib/logger-enterprise.ts` - New enterprise logger

**Files using old logger**:
```typescript
src/lib/dateUtils.ts:2        import { logger } from './logger';
src/lib/logger.test.ts:2      import { logger } from './logger';
src/lib/guestDataStore-old.ts import { logger } from './logger';
```

**Recommendation**:
- Standardize on `logger-enterprise`
- Update imports: `import { logger } from './logger-enterprise'`
- Consider renaming `logger-enterprise.ts` → `logger.ts` (delete old one first)

---

### 2. Test Database References

**File**: `scripts/test-auth-flow.js`

Contains hardcoded paths to legacy migration files:
```javascript
const schemaFile = path.join(path.dirname(__dirname), 'migrations', '0001_init_up.sql');
```

**Issue**: This file checks for SQL migrations that don't exist (Prisma handles migrations now)

**Action**: Update or delete this test script

---

### 3. Unused TypeScript Exclusions

**File**: `tsconfig.json`

```json
"exclude": [
  "scripts/init-db.ts",
  "scripts/test-db.ts",
  "scripts/migrate.ts",
  "src/lib/cacheManager.ts",
  "src/lib/monitor.ts"
]
```

**Recommendation**: Delete excluded files rather than keeping dead code

---

## 📦 Recommended Cleanup Actions

### Phase 1: Safe Deletions (No Risk)
```bash
# Delete SQLite legacy scripts
rm scripts/init-db.ts
rm scripts/migrate.ts  
rm scripts/test-db.ts

# Delete unused libraries
rm src/lib/cacheManager.ts
rm src/lib/monitor.ts

# Delete SQL.js types (no longer needed)
rm src/types/sqljs.d.ts

# Delete old guest data store
rm src/lib/guestDataStore-old.ts

# Update tsconfig.json to remove exclusions
```

**Files to delete**: 8 files (~1000+ lines of dead code)

---

### Phase 2: Refactoring (Medium Risk)

#### 2.1 Standardize Logger
```bash
# Option A: Rename enterprise logger
mv src/lib/logger-enterprise.ts src/lib/logger-new.ts
rm src/lib/logger.ts
mv src/lib/logger-new.ts src/lib/logger.ts

# Update imports in:
# - src/lib/dateUtils.ts
# - src/lib/logger.test.ts

# Option B: Keep both, update imports
# Change './logger' → './logger-enterprise' in:
# - src/lib/dateUtils.ts  
# - src/lib/logger.test.ts
```

#### 2.2 Remove Auth Compatibility Layer
```bash
# After verifying no imports use '@/lib/auth.ts' directly:
rm src/lib/auth.ts
```

**Check first**:
```bash
grep -r "from '@/lib/auth'" src/ --include="*.ts" --include="*.tsx" | grep -v "from '@/lib/auth/"
```

---

### Phase 3: Documentation Cleanup (Low Priority)

#### Files referencing deleted code:
- `docs/CODE_IMPROVEMENT_AUDIT.md` - References SQLite removal
- `docs/TEST_DATABASE_SETUP.md` - References pg-mem removal
- `scripts/test-auth-flow.js` - Checks for deleted migration files

**Action**: Update documentation to remove references to deleted legacy systems

---

## 🎯 Immediate Action Plan

### Step 1: Delete Dead Code (Safe)
```bash
# Create backup first
git add -A && git commit -m "Checkpoint before cleanup"

# Delete legacy SQLite files
rm scripts/init-db.ts scripts/migrate.ts scripts/test-db.ts
rm src/lib/cacheManager.ts src/lib/monitor.ts
rm src/types/sqljs.d.ts
rm src/lib/guestDataStore-old.ts

# Update tsconfig.json
# Remove exclusions for deleted files
```

**Lines of code removed**: ~1200+

---

### Step 2: Update tsconfig.json
Remove exclusions for deleted files:
```json
{
  "exclude": [
    "node_modules",
    "src/**/*.test.ts",
    "src/**/*.test.tsx",
    "src/**/__tests__/**"
    // Remove: "scripts/init-db.ts", etc.
  ]
}
```

---

### Step 3: Verify Build Still Works
```bash
npm run build
npm test
```

---

### Step 4: Check for Unused Exports (Optional)
```bash
# Install knip for dead code detection
npm install -D knip

# Run unused export detection
npx knip

# Review and remove unused exports
```

---

## 📊 Impact Summary

### Before Cleanup:
- **Legacy files**: 8+ files (~1200 lines)
- **TypeScript exclusions**: 5 files
- **Dead imports**: Multiple references to deleted modules
- **Documentation debt**: References to removed systems

### After Cleanup:
- ✅ **-1200 lines of dead code**
- ✅ **Cleaner tsconfig.json**
- ✅ **Single logger implementation**
- ✅ **Single auth module structure**
- ✅ **No SQLite references**
- ✅ **Prisma-only database layer**

---

## ⚠️ Risks & Mitigations

### Risk 1: External Dependencies
**Risk**: Other projects might reference deleted scripts  
**Mitigation**: Check if scripts are referenced in:
- `package.json` scripts
- CI/CD pipelines
- External documentation

### Risk 2: Runtime Errors
**Risk**: Deleted files might be lazy-loaded at runtime  
**Mitigation**: Full test suite run after cleanup

### Risk 3: Git History
**Risk**: Losing institutional knowledge  
**Mitigation**: Keep detailed commit messages and this audit document

---

## ✅ Validation Checklist

After cleanup, verify:
- [ ] `npm run build` succeeds
- [ ] `npm test` passes (99%+ pass rate)
- [ ] `npm start` runs without errors
- [ ] No import errors in console
- [ ] Health check responds
- [ ] API endpoints functional

---

## 📝 Recommended Commit Structure

```bash
# Commit 1: Delete legacy SQLite files
git rm scripts/init-db.ts scripts/migrate.ts scripts/test-db.ts
git rm src/lib/cacheManager.ts src/lib/monitor.ts
git rm src/types/sqljs.d.ts
git commit -m "chore: remove legacy SQLite database layer

- Delete init-db.ts, migrate.ts, test-db.ts (replaced by Prisma migrations)
- Delete cacheManager.ts, monitor.ts (unused, reference deleted database.ts)
- Delete sqljs.d.ts types (no longer needed)
- Removes ~800 lines of dead code"

# Commit 2: Delete old guest data store
git rm src/lib/guestDataStore-old.ts
git commit -m "chore: remove legacy guest data store

- Delete guestDataStore-old.ts (replaced by Prisma repositories)
- Removes ~450 lines of dead code"

# Commit 3: Update tsconfig
# Edit tsconfig.json
git add tsconfig.json
git commit -m "chore: clean up tsconfig.json exclusions

- Remove exclusions for deleted legacy files
- Keep only test file exclusions"

# Commit 4: Verify build
npm run build && npm test
git add -A
git commit -m "chore: verify build after cleanup

All tests passing, build successful"
```

---

## 🎉 Expected Outcome

**Clean, maintainable codebase with**:
- Single source of truth for database (Prisma)
- Single logger (enterprise)
- Single auth module structure
- No dead code in version control
- Faster builds (fewer files to process)
- Easier onboarding (less confusion)

---

*Ready to execute? Start with Phase 1 (safe deletions) and validate after each step.*
