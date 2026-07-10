from flask import Flask, render_template, request
import os
import pdfplumber
from sentence_transformers import SentenceTransformer, util

app = Flask(__name__)

UPLOAD_FOLDER = "uploads"
app.config["UPLOAD_FOLDER"] = UPLOAD_FOLDER

if not os.path.exists(UPLOAD_FOLDER):
    os.makedirs(UPLOAD_FOLDER)

model = SentenceTransformer('all-MiniLM-L6-v2')


def extract_text(pdf_path):
    text = ""
    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            if page.extract_text():
                text += page.extract_text() + "\n"
    return text


@app.route("/")
def home():
    return render_template("index.html")


@app.route("/rank", methods=["POST"])
def rank():

    job_description = request.form["job"]

    uploaded_files = request.files.getlist("resume")

    results = []

    job_embedding = model.encode(job_description, convert_to_tensor=True)

    for file in uploaded_files:

        if file.filename == "":
            continue

        path = os.path.join(app.config["UPLOAD_FOLDER"], file.filename)

        file.save(path)

        resume_text = extract_text(path)

        resume_embedding = model.encode(resume_text, convert_to_tensor=True)

        score = util.cos_sim(job_embedding, resume_embedding)

        results.append({
            "name": file.filename,
            "score": round(float(score[0][0]) * 100,2)
        })

    results = sorted(results,key=lambda x:x["score"],reverse=True)

    return render_template("result.html",results=results)


if __name__=="__main__":
    app.run(debug=True)
