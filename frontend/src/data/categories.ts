export const defaultTaskCategories = ['Work', 'Personal', 'Health', 'Learning', 'Home']

export function normalizeCategoryName(categoryName: string): string {
  return categoryName.trim().toLocaleLowerCase()
}

export function isDefaultTaskCategory(categoryName: string): boolean {
  const normalizedName = normalizeCategoryName(categoryName)
  return defaultTaskCategories.some(
    (defaultCategory) => normalizeCategoryName(defaultCategory) === normalizedName,
  )
}
