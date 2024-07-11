export const handleDirectory = async (directoryHandle) => {
    const files = [];
    for await (const [name, handle] of directoryHandle) {
      files.push({
        id: handle.name,
        name: handle.name,
        isDir: handle.kind === 'directory',
        handle: handle
      });
    }
    return files;
  };  