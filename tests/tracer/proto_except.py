import sys
class StepLimit(BaseException): pass
n = [0]; tripped = [False]
def local(frame, event, arg):
    if event == "line":
        n[0] += 1
        if n[0] > 8:
            tripped[0] = True
            raise StepLimit()
    return local
def glob(frame, event, arg):
    return local if frame.f_code.co_filename == "<user>" else None
code = """
i = 0
while i < 10**6:
    try:
        i += 1
        i += 0
    except:
        pass
"""
g = {}
sys.settrace(glob)
try:
    exec(compile(code, "<user>", "exec"), g)
    print("completed normally; i =", g["i"], "trace still set:", sys.gettrace() is not None)
except StepLimit:
    print("StepLimit escaped")
finally:
    sys.settrace(None)
print("tripped:", tripped[0], "line events seen:", n[0])
