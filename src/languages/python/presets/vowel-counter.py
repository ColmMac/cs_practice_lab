word = input("Enter a word: ")
vowels = 0
for ch in word:
    if ch in "aeiou":
        vowels = vowels + 1
print("Vowels:", vowels)
