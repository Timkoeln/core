import { IFileSystemService, TsConfigCompilerOptionsPaths, TsConfig, TsConfigFileData } from '@awdware/gah-shared';

export class TsConfigFile {
  private readonly _fileSystemService: IFileSystemService;

  private readonly _path: string;
  private readonly _tsConfig: TsConfig;


  public data(): TsConfigFileData {
    return {
      path: this._path,
      tsConfig: this._tsConfig
    };
  }

  public clean() {
    if (!this._tsConfig.compilerOptions.paths) {
      this._tsConfig.compilerOptions.paths = new TsConfigCompilerOptionsPaths();
    }

    const allPaths = Object.keys(this._tsConfig.compilerOptions.paths);
    allPaths.forEach((x) => {
      const pathCfg = this._tsConfig.compilerOptions.paths[x];
      if (pathCfg.some(pathCfgEntry => pathCfgEntry.startsWith('[gah]'))) {
        delete this._tsConfig.compilerOptions.paths[x];
      }
    });

    if (!this._tsConfig.compilerOptions.baseUrl) {
      this._tsConfig.compilerOptions.baseUrl = './';
    }

    this.save();
  }

  constructor(path: string, fileSystemService: IFileSystemService) {
    this._fileSystemService = fileSystemService;
    this._path = path;

    this._tsConfig = this._fileSystemService.parseFile<TsConfig>(this._path);

  }

  public save() {
    this._fileSystemService.saveObjectToFile(this._path, this._tsConfig);
  }

  public addPathAlias(aliasName: string, path: string) {
    this._tsConfig.compilerOptions.paths[aliasName] = [path, '[gah] This property was generated by gah'];
  }
}
