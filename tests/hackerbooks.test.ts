import test from 'node:test';
import assert from 'node:assert/strict';
import {hackerBooksAsset,hackerBooksIndex,parseRecommendedBooks,findRecommendedBooks,hackerBookUrl} from '../src/hackerbooks';

test('only current same-site book indexes are accepted from the public manifest',()=>{
 assert.equal(hackerBooksIndex('<script>window.__ASSETS={"books":"data/books.a12bc.json"};</script>'),'https://hackerbooks.org/data/books.a12bc.json');
 for(const path of ['https://elsewhere.test/data/books.a1.json','data/../books.a1.json','data/books.json','data/books.a1.json?x=1'])assert.throws(()=>hackerBooksIndex('<script>window.__ASSETS='+JSON.stringify({books:path})+';</script>'));
 assert.throws(()=>hackerBooksIndex('<script>window.__ASSETS=malicious()</script>'));
});
test('topic index and book metadata support browsing and matching the selected detail',()=>{
 assert.equal(hackerBooksAsset('<script>window.__ASSETS={"topics":"data/topics.ab12.json"};</script>','topics'),'https://hackerbooks.org/data/topics.ab12.json');
 assert.throws(()=>hackerBooksAsset('<script>window.__ASSETS={"topics":"data/books.ab12.json"};</script>','topics'));
 const [book]=parseRecommendedBooks([{id:'OL123W',t:'A book',a:['An author'],c:123,y:2021,f:2022,n:50,s:99,tp:['programming']}]);
 assert.deepEqual([book.cover,book.year,book.firstMentioned,book.mentions,book.score,book.topics],[123,2021,2022,50,99,['programming']]);
 assert.equal(hackerBookUrl(book),'https://hackerbooks.org/#/book/OL123W');
});
test('recommendations retain source identifiers and search titles and authors locally',()=>{
 const books=parseRecommendedBooks([{id:'OL257263W',t:'The Art of Computer Programming',a:['Donald Knuth'],y:1968,ru:336,u:1125},{id:'HBpractical-typography',t:'Practical Typography'},{id:'bad/../../',t:'Bad'},null]);
 assert.equal(books.length,2);assert.equal(books[0].recommendations,336);assert.equal(findRecommendedBooks(books,'KNUTH programming').length,1);assert.equal(findRecommendedBooks(books,'missing').length,0);assert.equal(hackerBookUrl(books[0]),'https://hackerbooks.org/#/book/OL257263W');assert.equal(hackerBookUrl(books[1]),'https://hackerbooks.org/#/book/HBpractical-typography');
});
