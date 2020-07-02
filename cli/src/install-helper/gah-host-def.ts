import { GahModuleBase } from './gah-module-base';
import { GahHost, PackageJson } from '@awdware/gah-shared';
import { GahModuleDef } from './gah-module-def';
import { GahFolder } from './gah-folder';

export class GahHostDef extends GahModuleBase {

  constructor(gahCfgPath: string, initializedModules: GahModuleBase[]) {
    super(gahCfgPath, null);


    const gahCfgFolder = this.fileSystemService.ensureAbsolutePath(this.fileSystemService.getDirectoryPathFromFilePath(gahCfgPath));
    this.basePath = this.fileSystemService.join(gahCfgFolder, '.gah');
    this.srcBasePath = './src';
    this.initTsConfigObject();

    const hostCfg = this.fileSystemService.parseFile<GahHost>(gahCfgPath);
    if (!hostCfg) {
      throw new Error('Cannot find host in file "' + gahCfgPath + '"');
    }
    hostCfg.modules?.forEach(moduleDependency => {
      moduleDependency.names.forEach(depModuleName => {
        const alreadyInitialized = initializedModules.find(x => x.moduleName === depModuleName);
        if (alreadyInitialized) {
          this.dependencies.push(alreadyInitialized);
        } else {
          this.dependencies.push(new GahModuleDef(moduleDependency.path, depModuleName, initializedModules));
        }
      });
    });

    this.gahFolder = new GahFolder(this.basePath, this.srcBasePath + '/app');
  }

  public async install() {
    if (this.installed) {
      return;
    }
    this.installed = true;

    this.tsConfigFile.clean();
    this.gahFolder.cleanGeneratedDirectory();
    this.gahFolder.cleanDependencyDirectory();
    this.gahFolder.cleanStylesDirectory();

    this.fileSystemService.deleteFilesInDirectory(this.fileSystemService.join(this.basePath, this.srcBasePath, 'assets'));
    this.fileSystemService.ensureDirectory(this.fileSystemService.join(this.basePath, this.srcBasePath, 'assets'));
    this.fileSystemService.deleteFile(this.fileSystemService.join(this.basePath, this.srcBasePath, 'styles.scss'));
    this.fileSystemService.saveFile(this.fileSystemService.join(this.basePath, this.srcBasePath, 'styles.scss'), '/*\n  * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *\n  *   Please do not edit this file. Any changes to this file will be overwriten by gah.   *\n  *              Check the documentation for how to edit your global styles:              *\n  *                        https://github.com/awdware/gah/wiki                        *\n  * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *\n*/');

    this.createSymlinksToDependencies();
    this.addDependenciesToTsConfigFile();
    this.generateFromTemplate();
    this.copyAssetsAndBaseStyles();
    this.mergePackageDependencies();
    this.generateStyleImports();
    this.adjustGitignore();
    this.adjustGitignoreForHost();
    await this.installPackages();
  }

  adjustGitignoreForHost() {
    this.workspaceService.ensureGitIgnoreLine('src/assets/**', 'Ignoring gah generated assets', this.basePath);
  }

  private generateFromTemplate() {
    for (const dep of this.allRecursiveDependencies) {
      this.gahFolder.addGeneratedFileTemplateData(dep.moduleName!, dep.packageName!, dep.isEntry, dep.baseNgModuleName);
    }
    this.gahFolder.generateFileFromTemplate();
  }

  private async installPackages() {
    // this.loggerService.startLoadingAnimation('Installing yarn packages');
    const success = await this.executionService.execute('yarn', false, undefined, '.gah');
    if (success) {
      // this.loggerService.stopLoadingAnimation(false, true, 'Packages installed successfully');
    } else {
      this.loggerService.stopLoadingAnimation(false, false, 'Installing packages failed');
      this.loggerService.error(this.executionService.executionErrorResult);
    }
  }

  private copyAssetsAndBaseStyles() {
    const stylesScss = this.fileSystemService.readFileLineByLine(this.fileSystemService.join(this.basePath, this.srcBasePath, 'styles.scss'));

    for (const dep of this.allRecursiveDependencies) {
      if (!dep.facadePathRelativeToBasePath) {
        continue;
      }
      // Copying assets
      const absoluteFacadePathOfDep = this.fileSystemService.join(dep.basePath, dep.facadePathRelativeToBasePath);
      const absoluteAssetsFolderOfDep = this.fileSystemService.join(absoluteFacadePathOfDep, 'assets');
      if (this.fileSystemService.directoryExists(absoluteAssetsFolderOfDep)) {
        const hostAssetsFolder = this.fileSystemService.join(this.basePath, this.srcBasePath, 'assets', dep.moduleName!);
        this.fileSystemService.copyFilesInDirectory(absoluteAssetsFolderOfDep, hostAssetsFolder);
      }

      const absoluteStylesFilePathOfDep = this.fileSystemService.join(dep.basePath, dep.facadePathRelativeToBasePath, 'styles.scss');

      // Copying base styles if they exist
      if (this.fileSystemService.fileExists(absoluteStylesFilePathOfDep)) {

        const depAbsoluteSrcFolder = this.fileSystemService.join(dep.basePath, dep.srcBasePath);
        const depAbsoluteFacadeFolder = this.fileSystemService.join(dep.basePath, dep.facadePathRelativeToBasePath);

        const depFacadeFolderRelativeToSrcBase = this.fileSystemService.ensureRelativePath(depAbsoluteFacadeFolder, depAbsoluteSrcFolder, true);
        const dependencyPathRelativeFromSrcBase = this.fileSystemService.ensureRelativePath(this.gahFolder.dependencyPath, this.srcBasePath, true);

        const moduleFacadePath = this.fileSystemService.join(dependencyPathRelativeFromSrcBase, dep.moduleName!, depFacadeFolderRelativeToSrcBase, 'styles.scss');
        stylesScss.push(`@import "${moduleFacadePath}";`);
      }
    }

    this.fileSystemService.saveFile(this.fileSystemService.join(this.basePath, this.srcBasePath, 'styles.scss'), stylesScss.join('\n'));
  }

  private mergePackageDependencies() {
    const packageJsonPath = this.fileSystemService.join(this.basePath, 'package.json');
    // Get package.json from host
    const packageJson = this.fileSystemService.parseFile<PackageJson>(packageJsonPath);
    const hostDeps = packageJson.dependencies!;
    const hostDevDeps = packageJson.devDependencies!;


    for (const dep of this.allRecursiveDependencies) {
      // Get package.json from module to installed into host
      const externalPackageJson = this.fileSystemService.parseFile<PackageJson>(this.fileSystemService.join(dep.basePath, 'package.json'));

      // Getting (dev-)dependency objects from host and module
      const externalDeps = externalPackageJson.dependencies!;
      const externalDevDeps = externalPackageJson.devDependencies!;

      const deps = Object.keys(externalDeps);
      const devDeps = Object.keys(externalDevDeps);

      // Merging module (dev-)dependencies into host
      deps.forEach((dep) => {
        if (!hostDeps[dep]) {
          hostDeps[dep] = externalDeps[dep];
        }
      });
      devDeps.forEach((dep) => {
        if (!hostDevDeps[dep]) {
          hostDevDeps[dep] = externalDevDeps[dep];
        }
      });

    }

    this.pluginService.pluginNames.forEach(x => {
      hostDevDeps[x.name] = x.version;
    });

    // Saving the file back into the host package.json
    this.fileSystemService.saveObjectToFile(packageJsonPath, packageJson);
  }


}
