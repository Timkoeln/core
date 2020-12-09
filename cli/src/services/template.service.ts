import { injectable, inject } from 'inversify';
import ejs from 'ejs';

import { ITemplateService, IFileSystemService } from '@gah/shared';

import { FileSystemService } from './file-system.service';

@injectable()
export class TemplateService implements ITemplateService {
  @inject(FileSystemService)
  private readonly _fileSystemService: IFileSystemService;

  public renderFile<T>(sourceFilePath: string, data: T, outputFilePath: string) {
    ejs.renderFile(sourceFilePath, data).then(renderedString => {
      this._fileSystemService.saveFile(outputFilePath, renderedString);
    });
  }
}
