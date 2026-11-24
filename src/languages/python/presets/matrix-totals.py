grid = [[1, 2, 3], [4, 5, 6]]
totals = []
for r in range(len(grid)):
    row_total = 0
    for c in range(len(grid[r])):
        row_total = row_total + grid[r][c]
    totals.append(row_total)
print(totals)
