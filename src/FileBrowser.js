import React, { useState, useEffect, useRef, useCallback } from 'react';
import { setChonkyDefaults } from 'chonky';
import { ChonkyIconFA } from 'chonky-icon-fontawesome';
import { FullFileBrowser, ChonkyActions } from 'chonky';
import LoadingBar from 'react-top-loading-bar';
import axios from 'axios';

setChonkyDefaults({ iconComponent: ChonkyIconFA });

export default function FileBrowser() {
  const [files, setFiles] = useState([]);
  const [folderChain, setFolderChain] = useState([{ id: 20, name: 'SBA' }]);
  const [currentFolderId, setCurrentFolderId] = useState(20); // Inicializar con el ID de la raíz 'SBA'
  const ref = useRef(null);

  const startLoading = () => ref.current.continuousStart();
  const stopLoading = () => ref.current.complete();

  const fileActions = React.useMemo(
    () => [
      ChonkyActions.CreateFolder,
      ChonkyActions.UploadFiles,
      ChonkyActions.DownloadFiles,
      ChonkyActions.DeleteFiles,
      ChonkyActions.OpenParentFolder,
      ChonkyActions.OpenFiles
    ],
    []
  );

  const buildFolderChain = useCallback(async (folderId) => {
    const newFolderChain = [];
    let currentFolder = folderId;
    const seenIds = new Set();

    while (currentFolder !== null && !seenIds.has(currentFolder)) {
      seenIds.add(currentFolder);
      try {
        const response = await axios.get('http://localhost:5000/api/folders', {
          params: { parentId: currentFolder }
        });
        const folderData = response.data;
        const folder = folderData.current_folder;
        if (folder) {
          newFolderChain.unshift({ id: folder.id, name: folder.name });
          currentFolder = folder.parent_id;
        } else {
          currentFolder = null;
        }
      } catch (error) {
        console.error('Error building folder chain', error);
        currentFolder = null;
      }
    }
    newFolderChain.unshift({ id: 20, name: 'SBA' }); // Añadir la carpeta raíz manualmente
    return newFolderChain;
  }, []);

  const loadFolder = useCallback(async (folderId) => {
    startLoading();
    try {
      const response = await axios.get('http://localhost:5000/api/folders', {
        params: { parentId: folderId }
      });
      const folderData = response.data;

      setFiles([
        ...folderData.folders.map(folder => ({
          id: folder.id,
          name: folder.name,
          isDir: true
        })),
        ...folderData.files.map(file => ({
          id: file.id,
          name: file.name,
          isDir: false
        }))
      ]);

      const newFolderChain = await buildFolderChain(folderId);
      setFolderChain(newFolderChain);
      setCurrentFolderId(folderId);
    } catch (error) {
      console.error('Error loading folder', error);
    } finally {
      stopLoading();
    }
  }, [buildFolderChain]);

  useEffect(() => {
    loadFolder(20); // Cargar la carpeta raíz 'SBA' al inicio
  }, [loadFolder]);

  const handleAction = useCallback(async (data) => {
    const startFileUpload = async (files) => {
      const formData = new FormData();
      for (const file of files) {
        formData.append('files', file);
      }
      formData.append('folderId', currentFolderId);
      await axios.post('http://localhost:5000/api/files', formData);
      loadFolder(currentFolderId);
    };


    const handleDelete = async (filesToDelete, foldersToDelete) => {
      try {
        if (filesToDelete.length > 0) {
          await axios.delete('http://localhost:5000/api/files', {
            data: { fileIds: filesToDelete.map(file => file.id) }
          });
        }
        if (foldersToDelete.length > 0) {
          await axios.delete('http://localhost:5000/api/folders', {
            data: { folderIds: foldersToDelete.map(folder => folder.id) }
          });
        }
        loadFolder(currentFolderId);
      } catch (error) {
        console.error('Error deleting files or folders', error);
      }
    };

    const handleFileDownload = async (fileId, fileName) => {
      const response = await axios.get(`http://localhost:5000/api/files/${fileId}`, {
        responseType: 'blob'
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', fileName);
      document.body.appendChild(link);
      link.click();
      link.remove();
    };

    startLoading();
    try {
      console.log(data)
      const file = data.payload?.files[0] || data.state?.selectedFiles[0];
      switch (data.id) {
        case ChonkyActions.DeleteFiles.id:
          console.log("sss")
          const filesToDelete = data.state.selectedFiles.filter(file => !file.isDir);
          const foldersToDelete = data.state.selectedFiles.filter(file => file.isDir);
          await handleDelete(filesToDelete, foldersToDelete);
          break;
        case ChonkyActions.OpenParentFolder.id:
          const parentFolder = folderChain[folderChain.length - 2];
          if (parentFolder) {
            loadFolder(parentFolder.id);
          }
          break;
        case ChonkyActions.OpenFiles.id:
          console.log(file)
          console.log(file.id)
          console.log(Object.keys(file).length)
          if (file && file.isDir) {
            loadFolder(file.id);
          }else if(Object.keys(file).length===2){
            console.log(file.id)
            loadFolder(file.id);
          }
          break;
        case ChonkyActions.DownloadFiles.id:
          if (file && !file.isDir) {
            await handleFileDownload(file.id, file.name);
          }
          break;
        case ChonkyActions.CreateFolder.id:
          const folderName = prompt("Enter the name for the new folder:");
          if (folderName) {
            await axios.post('http://localhost:5000/api/folders', {
              name: folderName,
              parentId: currentFolderId
            });
            loadFolder(currentFolderId);
          }
          break;
        case ChonkyActions.UploadFiles.id:
          const fileInput = document.createElement('input');
          fileInput.type = 'file';
          fileInput.multiple = true;
          fileInput.onchange = () => startFileUpload(fileInput.files);
          fileInput.click();
          break;
        case ChonkyActions.Search.id:
          const query = prompt("Enter the name of the file to search:");
          if (query) {
            const response = await axios.get('http://localhost:5000/api/search', {
              params: { query }
            });
            setFiles(response.data);
            setFolderChain([{ id: null, name: 'Search Results' }]);
          }
          break;

  

        default:
          break;
      }
    } catch (error) {
      console.error('Error handling action', error);
    } finally {
      stopLoading();
    }
  }, [currentFolderId, folderChain, loadFolder]);

  return (
    <div className="App">
      <h1>SBA File Browser</h1>
      <LoadingBar color="#f11946" ref={ref} />
      <FullFileBrowser
        files={files}
        folderChain={folderChain}
        fileActions={fileActions}
        onFileAction={handleAction}
        disableDefaultFileActions={true}
      />
    </div>
  );
}