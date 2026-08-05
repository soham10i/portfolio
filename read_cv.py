from pypdf import PdfReader
reader = PdfReader("/Users/sohampatel/Downloads/Soham_Patel_CV (1).pdf")
text = "\n".join([p.extract_text() or "" for p in reader.pages])
print(text[:10000])
