items = [4, 8, 15, 16, 23, 42]
target = 15
found = False
i = 0
while i < len(items) and not found:
    if items[i] == target:
        found = True
    else:
        i = i + 1
print(found, i)
