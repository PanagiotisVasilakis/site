#!/bin/bash
# Script to migrate all files from old logger to logger-enterprise

set -e

echo "🔄 Migrating to enterprise logger..."

# Find all TypeScript files using the old logger (excluding tests and logger.ts itself)
FILES=$(find src -type f \( -name "*.ts" -o -name "*.tsx" \) \
  -not -name "*.test.ts" \
  -not -name "logger.ts" \
  -exec grep -l "from '@/lib/logger'" {} \;)

COUNT=$(echo "$FILES" | wc -l)
echo "📝 Found $COUNT files to update"

# Update each file
UPDATED=0
for file in $FILES; do
  # Skip if file contains logger-enterprise (already migrated)
  if grep -q "logger-enterprise" "$file"; then
    echo "⏭️  Skipping $file (already uses enterprise logger)"
    continue
  fi
  
  # Replace the import
  if sed -i "s|from '@/lib/logger'|from '@/lib/logger-enterprise'|g" "$file"; then
    echo "✅ Updated: $file"
    ((UPDATED++))
  else
    echo "❌ Failed: $file"
  fi
done

echo ""
echo "✨ Migration complete!"
echo "   Updated: $UPDATED files"
echo "   Skipped: $((COUNT - UPDATED)) files"
echo ""
echo "Next steps:"
echo "1. Run 'npm run build' to verify compilation"
echo "2. Run 'npm test' to ensure tests pass"
echo "3. Review changes with 'git diff'"
