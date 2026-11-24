nums = [5, 2, 4, 1]
n = len(nums)
for i in range(n - 1):
    swapped = False
    for j in range(n - 1 - i):
        if nums[j] > nums[j + 1]:
            nums[j], nums[j + 1] = nums[j + 1], nums[j]
            swapped = True
    if not swapped:
        break
print(nums)
