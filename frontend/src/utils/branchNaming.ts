export const generateUniqueBranchName = (
  basePrefix: string,
  existingBranches: { name: string }[]
): string => {
  const existingNames = new Set(existingBranches.map(b => b.name));
  let counter = 1;
  let newName = `${basePrefix}-${counter}`;
  
  while (existingNames.has(newName)) {
    counter++;
    newName = `${basePrefix}-${counter}`;
  }
  
  return newName;
};