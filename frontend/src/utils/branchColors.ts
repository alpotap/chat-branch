// Centralized branch color utilities
export const BRANCH_COLORS = {
  main: '#10B981', // Green for main branch (always fixed)
  presets: [
    '#FF6B6B', // Red
    '#4ECDC4', // Teal
    '#45B7D1', // Blue
    '#FFA07A', // Light Salmon
    '#98D8C8', // Mint
    '#F7DC6F', // Yellow
    '#BB8FCE', // Purple
    '#F1948A', // Light Red
    '#85C1E9', // Light Blue
    '#82E0AA'  // Light Green
  ]
};

export const getBranchColor = (branchName: string, customColor?: string): string => {
  // If custom color is provided, use it (including for main branch)
  if (customColor) {
    return customColor;
  }
  
  // Main branch gets default green if no custom color
  if (branchName === 'main') {
    return BRANCH_COLORS.main;
  }
  
  // Fallback to hash-based color selection from presets
  let hash = 0;
  for (let i = 0; i < branchName.length; i++) {
    hash = branchName.charCodeAt(i) + ((hash << 5) - hash);
  }
  const colorIndex = Math.abs(hash) % BRANCH_COLORS.presets.length;
  return BRANCH_COLORS.presets[colorIndex];
};

// Helper function to get branch color from conversation tree
export const getBranchColorFromTree = (branchName: string, conversationTree?: any): string => {
  // Look up stored color from conversation tree first (including main branch)
  if (conversationTree?.branches) {
    const branch = conversationTree.branches.find((b: any) => b.name === branchName);
    if (branch && branch.color) {
      return branch.color;
    }
  }
  
  // Fallback: Main branch gets default green if no custom color
  if (branchName === 'main') {
    return BRANCH_COLORS.main;
  }
  
  // Fallback to hash-based color selection from presets for other branches
  return getBranchColor(branchName);
};

export const getRandomBranchColor = (): string => {
  const randomIndex = Math.floor(Math.random() * BRANCH_COLORS.presets.length);
  return BRANCH_COLORS.presets[randomIndex];
};
