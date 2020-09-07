import { getCustomRepository, getRepository, In } from 'typeorm';

import csvParse from 'csv-parse';
import fs from 'fs';
import Transaction from '../models/Transaction';
import Category from '../models/Category';
import TransactionsRespository from '../repositories/TransactionsRepository';

interface CsvTransaction {
  title: string;
  type: 'income' | 'outcome';
  value: string;
  category: string;
}

class ImportTransactionsService {
  async execute(path: string): Promise<Transaction[]> {
    const readStream = fs.createReadStream(path);

    const parses = csvParse({ from_line: 2 });

    const parseCSV = readStream.pipe(parses);

    const transactions: CsvTransaction[] = [];
    const categories: string[] = [];

    parseCSV.on('data', async line => {
      const [title, type, value, category] = line.map((cell: string) =>
        cell.trim(),
      );

      if (!title || !type || !value) return;

      categories.push(category);

      transactions.push({ title, type, value, category });
    });

    await new Promise(resolve => parseCSV.on('end', resolve));

    const categoriesRepository = getRepository(Category);

    const existentCatogories = await categoriesRepository.find({
      where: {
        title: In(categories),
      },
    });

    const existentCategoriesTitles = existentCatogories.map(
      (category: Category) => category.title,
    );

    const addCategories = categories
      .filter(category => !existentCategoriesTitles.includes(category))
      .filter((value, index, self) => self.indexOf(value) === index);

    const newCategories = categoriesRepository.create(
      addCategories.map(title => ({ title })),
    );

    await categoriesRepository.save(newCategories);

    const finalCategories = [...newCategories, ...existentCatogories];

    const transactionsRespository = getCustomRepository(
      TransactionsRespository,
    );

    const createdTransactions = transactionsRespository.create(
      transactions.map(transaction => ({
        title: transaction.title,
        type: transaction.type,
        value: +transaction.value,
        category: finalCategories.find(
          category => category.title === transaction.category,
        ),
      })),
    );

    await transactionsRespository.save(createdTransactions);

    await fs.promises.unlink(path);

    return createdTransactions;
  }
}

export default ImportTransactionsService;
