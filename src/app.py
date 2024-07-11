from flask import Flask, request, jsonify, send_file
from flask_sqlalchemy import SQLAlchemy
from flask_cors import CORS
import io
import concurrent.futures

app = Flask(__name__)
CORS(app)

app.config['SQLALCHEMY_DATABASE_URI'] = 'postgresql://postgres:Evenor2510Tech@localhost:5432/sba'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

db = SQLAlchemy(app)

class Folder(db.Model):
    __tablename__ = 'folders'
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String, nullable=False)
    parent_id = db.Column(db.Integer, db.ForeignKey('folders.id'), nullable=True)
    files = db.relationship('File', backref='folder', cascade="all, delete-orphan")
    subfolders = db.relationship('Folder', backref=db.backref('parent', remote_side=[id]), cascade="all, delete-orphan")

class File(db.Model):
    __tablename__ = 'files'
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String, nullable=False)
    folder_id = db.Column(db.Integer, db.ForeignKey('folders.id'), nullable=True)
    content = db.Column(db.LargeBinary, nullable=False)

# Crear la base de datos y las tablas
with app.app_context():
    db.create_all()

@app.route('/api/folders', methods=['GET'])
def get_folders():
    parent_id = request.args.get('parentId')
    if parent_id is None:
        parent_id = None
    else:
        parent_id = int(parent_id)

    def fetch_folders_and_files(parent_id):
        with app.app_context():
            folders = Folder.query.filter_by(parent_id=parent_id).all()
            files = File.query.filter_by(folder_id=parent_id).all()
            current_folder = Folder.query.get(parent_id) if parent_id else None

            response = {
                'folders': [{'id': folder.id, 'name': folder.name, 'isDir': True} for folder in folders],
                'files': [{'id': file.id, 'name': file.name, 'isDir': False} for file in files],
                'current_folder': {'id': current_folder.id, 'name': current_folder.name, 'parent_id': current_folder.parent_id} if current_folder else None
            }
            return response

    with concurrent.futures.ThreadPoolExecutor() as executor:
        future = executor.submit(fetch_folders_and_files, parent_id)
        response = future.result()

    return jsonify(response)

@app.route('/api/files/<int:file_id>', methods=['GET'])
def get_file(file_id):
    def fetch_file(file_id):
        with app.app_context():
            file = File.query.get(file_id)
            if file:
                return send_file(
                    io.BytesIO(file.content),
                    attachment_filename=file.name,
                    as_attachment=True
                )
            return None

    with concurrent.futures.ThreadPoolExecutor() as executor:
        future = executor.submit(fetch_file, file_id)
        response = future.result()

    if response is None:
        return 'File not found', 404

    return response

@app.route('/api/folders', methods=['POST'])
def create_folder():
    data = request.json
    name = data.get('name')
    parent_id = data.get('parentId')

    def save_folder(name, parent_id):
        with app.app_context():
            new_folder = Folder(name=name, parent_id=parent_id)
            db.session.add(new_folder)
            db.session.commit()
            return {'id': new_folder.id, 'name': new_folder.name, 'isDir': True}

    with concurrent.futures.ThreadPoolExecutor() as executor:
        future = executor.submit(save_folder, name, parent_id)
        response = future.result()

    return jsonify(response), 201

def save_file(file, folder_id):
    with app.app_context():
        new_file = File(name=file.filename, folder_id=folder_id, content=file.read())
        db.session.add(new_file)
        db.session.commit()

@app.route('/api/files', methods=['POST'])
def upload_files():
    files = request.files.getlist('files')
    folder_id = request.form['folderId']
    with concurrent.futures.ThreadPoolExecutor() as executor:
        futures = [executor.submit(save_file, file, folder_id) for file in files]
        concurrent.futures.wait(futures)
    return jsonify({'message': 'Files uploaded successfully'}), 201

@app.route('/api/search', methods=['GET'])
def search_files():
    query = request.args.get('query')

    def perform_search(query):
        with app.app_context():
            files = File.query.filter(File.name.ilike(f"%{query}%")).all()
            response = [{'id': file.id, 'name': file.name, 'isDir': False} for file in files]
            return response

    with concurrent.futures.ThreadPoolExecutor() as executor:
        future = executor.submit(perform_search, query)
        response = future.result()

    return jsonify(response)

@app.route('/api/files', methods=['DELETE'])
def delete_files():
    file_ids = request.json.get('fileIds', [])
    if not file_ids:
        return jsonify({'message': 'No file IDs provided'}), 400

    try:
        for file_id in file_ids:
            file = File.query.get(file_id)
            if file:
                db.session.delete(file)
        db.session.commit()
        return jsonify({'message': 'Files deleted successfully'}), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({'message': 'Error deleting files', 'error': str(e)}), 500

@app.route('/api/folders', methods=['DELETE'])
def delete_folders():
    folder_ids = request.json.get('folderIds', [])
    if not folder_ids:
        return jsonify({'message': 'No folder IDs provided'}), 400

    try:
        for folder_id in folder_ids:
            folder = Folder.query.get(folder_id)
            if folder:
                db.session.delete(folder)
        db.session.commit()
        return jsonify({'message': 'Folders deleted successfully'}), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({'message': 'Error deleting folders', 'error': str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True, port=5000)